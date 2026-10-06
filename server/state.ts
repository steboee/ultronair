import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AgentView, BoardState, LogLine, Task } from '../shared/types'
import { DATA_DIR, DEPTS, DESKS, PROJECT, RUNTIME, projectExists } from './config'

const FILE = path.join(DATA_DIR, 'tasks.json')
mkdirSync(DATA_DIR, { recursive: true })

export const tasks = new Map<string, Task>()
export const agents = new Map<string, AgentView>(
  DESKS.map((d) => [d.id, { id: d.id, name: d.name, role: d.role, dept: d.dept, kind: d.kind, model: d.modelFor('M').alias, status: 'idle' }]),
)

// load; anything that was mid-run when HQ stopped is marked so you can retry it
if (existsSync(FILE)) {
  for (const t of JSON.parse(readFileSync(FILE, 'utf8')) as Task[]) {
    if (t.status === 'running' || t.status === 'queued') {
      t.status = 'failed'
      t.error = 'Interrupted: HQ was restarted. Press Retry to continue from this step.'
      t.agentId = undefined; t.activity = undefined
    }
    tasks.set(t.key, t)
  }
}

type Listener = (s: BoardState) => void
const listeners = new Set<Listener>()
export const subscribe = (l: Listener) => { listeners.add(l); return () => listeners.delete(l) }

export function snapshot(): BoardState {
  return {
    runtime: RUNTIME,
    project: { id: PROJECT.id, path: PROJECT.path, exists: projectExists(), baseBranch: PROJECT.base_branch },
    departments: DEPTS,
    agents: [...agents.values()],
    tasks: [...tasks.values()].sort((a, b) => b.createdAt - a.createdAt),
  }
}

let timer: NodeJS.Timeout | undefined
/** Call after any change: persists and pushes to every open board (throttled). */
export function changed() {
  if (timer) return
  timer = setTimeout(() => {
    timer = undefined
    writeFileSync(FILE, JSON.stringify([...tasks.values()], null, 1))
    const s = snapshot()
    listeners.forEach((l) => l(s))
  }, 200)
}

export function log(t: Task, text: string, agent?: string) {
  const line: LogLine = { ts: Date.now(), agent, text }
  t.log.push(line)
  if (t.log.length > 300) t.log.splice(0, t.log.length - 300)
  t.updatedAt = Date.now()
  changed()
}

export const handoffDir = (key: string) => path.join(DATA_DIR, 'tasks', key)
export function writeHandoff(t: Task, name: string, content: string) {
  mkdirSync(handoffDir(t.key), { recursive: true })
  writeFileSync(path.join(handoffDir(t.key), name), content)
  if (!t.files.includes(name)) t.files.push(name)
  changed()
}
export function readHandoff(key: string, name: string): string | undefined {
  const p = path.join(handoffDir(key), path.basename(name))
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined
}
