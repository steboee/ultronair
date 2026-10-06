import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import type { NewTask } from '../shared/types'
import { PROJECT, ROOT, RUNTIME, projectExists } from './config'
import { approve, cancel, createTask, followUp, removeTask, requestChanges, retry } from './pipeline'
import { readHandoff, snapshot, subscribe } from './state'

const PORT = Number(process.env.PORT ?? 4400)

async function body<T>(req: IncomingMessage): Promise<T> {
  let s = ''
  for await (const c of req) s += c
  return (s ? JSON.parse(s) : {}) as T
}
const json = (res: ServerResponse, code: number, v: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(v))
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname
  if (!p.startsWith('/api/')) return false
  try {
    if (req.method === 'GET' && p === '/api/state') return json(res, 200, snapshot()), true
    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      const send = (s: unknown) => res.write(`data: ${JSON.stringify(s)}\n\n`)
      send(snapshot())
      const off = subscribe(send)
      const ping = setInterval(() => res.write(': ping\n\n'), 20000)
      req.on('close', () => { off(); clearInterval(ping) })
      return true
    }
    if (req.method === 'POST' && p === '/api/tasks') {
      const n = await body<NewTask>(req)
      if (!n.title?.trim()) return json(res, 400, { error: 'Give the task a title.' }), true
      if (n.size && !['S', 'M', 'L'].includes(n.size)) return json(res, 400, { error: 'Size must be S, M or L.' }), true
      if (n.kind && !['question', 'change'].includes(n.kind)) return json(res, 400, { error: 'Kind must be question or change.' }), true
      return json(res, 201, createTask(n)), true
    }
    const m = p.match(/^\/api\/tasks\/([^/]+)\/(approve|changes|followup|retry|cancel|file)(?:\/(.+))?$/)
    if (m) {
      const key = decodeURIComponent(m[1])
      switch (m[2]) {
        case 'approve': approve(key); break
        case 'changes': {
          const { feedback } = await body<{ feedback: string }>(req)
          if (!feedback?.trim()) return json(res, 400, { error: 'Say what should change.' }), true
          requestChanges(key, feedback.trim()); break
        }
        case 'followup': {
          const { question } = await body<{ question: string }>(req)
          if (!question?.trim()) return json(res, 400, { error: 'Type your follow-up question.' }), true
          followUp(key, question.trim()); break
        }
        case 'retry': retry(key); break
        case 'cancel': cancel(key); break
        case 'file': {
          const text = readHandoff(key, decodeURIComponent(m[3] ?? ''))
          return text === undefined ? json(res, 404, { error: 'No such file yet' }) : res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(text), true
        }
      }
      return json(res, 200, { ok: true }), true
    }
    const del = p.match(/^\/api\/tasks\/([^/]+)$/)
    if (del && req.method === 'DELETE') { await removeTask(decodeURIComponent(del[1])); return json(res, 200, { ok: true }), true }
    return json(res, 404, { error: 'Not found' }), true
  } catch (e) {
    return json(res, 400, { error: (e as Error).message }), true
  }
}

// The board is served by Vite in middleware mode: one process, one port, hot reload.
const { createServer: createVite } = await import('vite')
const vite = await createVite({
  root: path.join(ROOT, 'web'),
  configFile: path.join(ROOT, 'web/vite.config.ts'),
  server: { middlewareMode: true, hmr: { port: PORT + 1 } },
  appType: 'spa',
})

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (await api(req, res, url)) return
  vite.middlewares(req, res)
}).listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Ultronair HQ  →  http://localhost:${PORT}\n`)
  console.log(`  runtime: ${RUNTIME === 'mock' ? 'mock (no Claude calls)' : 'Claude Code (claude -p)'}`)
  console.log(`  project: ${PROJECT.id} at ${PROJECT.path}${projectExists() ? '' : '  ⚠ not a git repo – set PROJECT_PATH'}\n`)
})
