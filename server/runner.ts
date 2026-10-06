import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import type { Tokens } from '../shared/types'
import { KIT_DIR, RUNTIME } from './config'

export interface AgentRun {
  /** text the agent ended with (its report) */
  text: string
  costUsd: number
  tokens: Tokens
  ok: boolean
  error?: string
  /** how many skills / agents Claude Code loaded for this run */
  loaded?: { skills: number; agents: number }
}
const NO_TOKENS: Tokens = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }

export interface RunOptions {
  cwd: string
  prompt: string
  systemPrompt: string
  model?: string
  effort?: string
  /** Claude Code tool rules, e.g. "Read", "Bash(composer test:*)" */
  allowedTools: string[]
  /** acceptEdits for agents that change code; default otherwise */
  permissionMode: 'default' | 'acceptEdits'
  onActivity: (text: string) => void
  /** Claude Code's rate_limit_info (plan limits), once per run */
  onRateLimit?: (info: unknown) => void
  signal: AbortSignal
  /** what the mock runtime should answer with */
  mock?: () => string
}

const short = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** One line about a tool call, for the board ("Edit OnboardingService.php"). */
function describeTool(name: string, input: Record<string, unknown>): string {
  const file = typeof input.file_path === 'string' ? path.basename(input.file_path) : undefined
  switch (name) {
    case 'Read': case 'Edit': case 'Write': case 'MultiEdit': return `${name} ${file ?? ''}`.trim()
    case 'Bash': return `Running ${short(String(input.command ?? ''), 60)}`
    case 'Grep': return `Searching for "${short(String(input.pattern ?? ''), 40)}"`
    case 'Glob': return `Listing ${short(String(input.pattern ?? ''), 40)}`
    case 'Task': case 'Agent': return `Delegating: ${short(String(input.description ?? ''), 50)}`
    default: return name
  }
}

/**
 * Runs one agent turn with the local Claude Code CLI (`claude -p`), using whatever
 * login your Claude Code already has. Streams tool use as activity; returns the
 * final report and its cost.
 */
export function runAgent(o: RunOptions): Promise<AgentRun> {
  if (RUNTIME === 'mock') return runMock(o)
  const args = [
    '-p', o.prompt,
    '--output-format', 'stream-json', '--verbose',
    '--append-system-prompt', o.systemPrompt,
    '--permission-mode', o.permissionMode,
    '--no-session-persistence',
    '--plugin-dir', KIT_DIR,
    '--allowedTools', ...o.allowedTools,
  ]
  if (o.model) args.push('--model', o.model)
  if (o.effort && !/haiku/.test(o.model ?? '')) args.push('--effort', o.effort)

  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(process.env.CLAUDE_BIN ?? 'claude', args, { cwd: o.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    } catch (e) {
      return resolve({ text: '', costUsd: 0, tokens: NO_TOKENS, ok: false, error: `Could not start Claude Code: ${(e as Error).message}` })
    }
    const kill = () => child.kill('SIGTERM')
    o.signal.addEventListener('abort', kill, { once: true })
    let buf = '', lastText = '', stderr = ''
    let result: AgentRun | undefined
    let loaded: AgentRun['loaded']

    child.stdout!.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let m: any
        try { m = JSON.parse(line) } catch { continue }
        if (m.type === 'system' && m.subtype === 'init') loaded = { skills: m.skills?.length ?? 0, agents: m.agents?.length ?? 0 }
        else if (m.type === 'rate_limit_event') o.onRateLimit?.(m.rate_limit_info)
        else if (m.type === 'assistant' && m.parent_tool_use_id == null) {
          for (const b of m.message?.content ?? []) {
            if (b.type === 'tool_use') o.onActivity(describeTool(b.name, b.input ?? {}))
            if (b.type === 'text' && b.text?.trim()) lastText = b.text
          }
        } else if (m.type === 'result') {
          const text = typeof m.result === 'string' ? m.result : lastText
          const u = m.usage ?? {}
          result = {
            text, costUsd: Number(m.total_cost_usd ?? 0), loaded,
            tokens: { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 },
            ok: !m.is_error && m.subtype === 'success', error: m.is_error ? `Claude Code ended with: ${m.subtype ?? 'error'}` : undefined,
          }
        }
      }
    })
    child.stderr!.on('data', (c: Buffer) => { stderr = (stderr + c.toString()).slice(-2000) })
    child.on('error', (e) => resolve({ text: '', costUsd: 0, tokens: NO_TOKENS, ok: false, error: `Could not start Claude Code (${e.message}). Is \`claude\` on your PATH?` }))
    child.on('close', (code) => {
      o.signal.removeEventListener('abort', kill)
      if (o.signal.aborted) return resolve({ text: lastText, costUsd: result?.costUsd ?? 0, tokens: result?.tokens ?? NO_TOKENS, ok: false, error: 'Cancelled' })
      resolve(result ?? { text: lastText, costUsd: 0, tokens: NO_TOKENS, ok: false, error: `Claude Code exited with code ${code}. ${stderr.trim().split('\n').pop() ?? ''}` })
    })
  })
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms)
  signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('Cancelled')) }, { once: true })
})

/** No Claude calls: fake activity and canned reports, to try the board for free. */
async function runMock(o: RunOptions): Promise<AgentRun> {
  const acts = ['Searching for "Onboarding"', 'Read OnboardingService.php', 'Read routes.php', 'Edit QuestionnaireResume.php', 'Running composer test']
  try {
    for (let i = 0; i < 3; i++) { o.onActivity(acts[Math.floor(Math.random() * acts.length)]); await sleep(1200 + Math.random() * 1500, o.signal) }
  } catch { return { text: '', costUsd: 0, tokens: NO_TOKENS, ok: false, error: 'Cancelled' } }
  const out = Math.round(300 + Math.random() * 1500)
  return { text: o.mock?.() ?? 'Done.', costUsd: 0, ok: true, tokens: { input: 40, cacheWrite: 2000, cacheRead: 30000 + out * 10, output: out } }
}

/** Run a shell command (verify, git). Never throws; returns exit code and tail of output. */
export function sh(cmd: string, cwd: string, signal?: AbortSignal): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', cmd], { cwd, env: process.env })
    let out = ''
    const add = (c: Buffer) => { out = (out + c.toString()).slice(-20000) }
    child.stdout.on('data', add); child.stderr.on('data', add)
    const kill = () => child.kill('SIGTERM')
    signal?.addEventListener('abort', kill, { once: true })
    child.on('error', (e) => resolve({ code: 1, out: e.message }))
    child.on('close', (code) => { signal?.removeEventListener('abort', kill); resolve({ code: code ?? 1, out }) })
  })
}
