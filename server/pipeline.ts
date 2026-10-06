import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Column, Kind, NewTask, Size, Step, Task, Tokens } from '../shared/types'
import { DATA_DIR, DESKS, PROJECT, ROUTES, RUNTIME, projectExists, type Desk } from './config'
import { MOCK, ROLE, systemFor } from './prompts'
import { runAgent, sh } from './runner'
import { agents, changed, log, readHandoff, setUsage, tasks, usage, writeHandoff } from './state'

/** Which board column each route step lives in. */
const COLUMN_OF: Record<string, Column> = {
  triage: 'inbox', analyst: 'answer', 'pm-lead': 'spec', 'approve-spec': 'approve_spec', 'tech-lead': 'build', implementer: 'build',
  verify: 'verify', review: 'review', 'primary-reviewer': 'review', 'mr-writer': 'mr', 'approve-mr': 'approve_mr',
}
const GATES = new Set(['approve-spec', 'approve-mr'])
const routeFor = (t: Task) => (t.kind === 'question' ? ROUTES.Q : ROUTES[t.size])

const running = new Map<string, AbortController>()
const busy = new Set<string>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const addTokens = (a: Tokens, b: Tokens) => {
  a.input += b.input; a.cacheWrite += b.cacheWrite; a.cacheRead += b.cacheRead; a.output += b.output
}

// ---------- desks ----------
async function acquire(base: string, t: Task, signal: AbortSignal): Promise<Desk> {
  for (;;) {
    if (signal.aborted) throw new Error('Cancelled')
    const d = DESKS.find((x) => x.base === base && !busy.has(x.id))
    if (d) { busy.add(d.id); return d }
    t.activity = `Waiting for a free ${base}`; changed()
    await sleep(1000)
  }
}
function release(d: Desk) {
  busy.delete(d.id)
  const a = agents.get(d.id)
  if (a) { a.status = 'idle'; a.taskKey = undefined; a.activity = undefined }
  changed()
}

function startStep(t: Task, name: string, d?: Desk): Step {
  const s: Step = { name, agentId: d?.id, agentName: d?.name, status: 'running', startedAt: Date.now() }
  t.steps.push(s)
  t.column = COLUMN_OF[name] ?? t.column
  t.agentId = d?.id
  if (d) { const a = agents.get(d.id)!; a.status = 'working'; a.taskKey = t.key; a.activity = 'Starting' }
  changed()
  return s
}
function endStep(t: Task, s: Step, status: Step['status'], note?: string) {
  s.status = status; s.endedAt = Date.now(); if (note) s.note = note
  t.agentId = undefined; t.activity = undefined
  changed()
}

/** Tool rules for a desk: its yaml tools, Bash patterns, the Skill tool, and Task for desks that spawn subagents. */
function toolsFor(d: Desk): string[] {
  const allowed = new Set([...d.tools.filter((x) => x !== 'Bash'), 'Skill'])
  if (d.base === 'implementer' || d.base === 'contract-specialist') { allowed.add('Edit'); allowed.add('Write') }
  if (d.spawns.length) allowed.add('Task')
  if (d.tools.includes('Bash')) {
    const patterns = d.bashAllow.length ? d.bashAllow : ['git diff*', 'git status*', 'git log*', 'git show*']
    for (const p of patterns) allowed.add(`Bash(${p.replace(/\*$/, '').trim()}:*)`)
  }
  return [...allowed]
}

/** Run one Claude Code agent for a desk role and return its report. */
async function agent(t: Task, base: string, ctx: Record<string, string>, signal: AbortSignal, label = base): Promise<string> {
  const role = ROLE[base]
  const d = await acquire(base, t, signal)
  const s = startStep(t, label, d)
  try {
    const m = d.modelFor(t.size)
    const cwd = t.worktree ?? PROJECT.path
    log(t, `${d.name} (${d.role}) started${m.alias ? ` on ${m.alias}` : ''}`, d.id)
    const run = await runAgent({
      cwd,
      prompt: role.prompt(t, ctx),
      systemPrompt: systemFor(d, cwd),
      model: m.id,
      effort: m.effort,
      allowedTools: toolsFor(d),
      permissionMode: d.base === 'implementer' || d.base === 'contract-specialist' ? 'acceptEdits' : 'default',
      signal,
      mock: () => MOCK[base]?.(t) ?? 'Done.',
      onRateLimit: (info) => {
        setUsage(info)
        const pct = usage.fiveHour?.pct
        if (pct !== undefined) t.session = { start: t.session?.start ?? pct, end: pct }
      },
      onActivity: (a) => {
        t.activity = a
        const av = agents.get(d.id); if (av) av.activity = a
        log(t, a, d.id)
      },
    })
    s.costUsd = run.costUsd
    s.tokens = run.tokens
    t.costUsd += run.costUsd
    addTokens(t.tokens, run.tokens)
    if (!run.ok) { endStep(t, s, 'failed', run.error); throw new Error(`${d.name} (${d.role}): ${run.error}`) }
    endStep(t, s, 'done')
    const k = Math.round((run.tokens.input + run.tokens.cacheWrite + run.tokens.cacheRead + run.tokens.output) / 1000)
    log(t, `${d.name} finished (${k}k tokens${run.loaded ? `, ${run.loaded.skills} skills available` : ''})`, d.id)
    return run.text.trim()
  } finally {
    release(d)
  }
}

// ---------- git ----------
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

async function ensureWorktree(t: Task, signal: AbortSignal) {
  if (t.worktree && existsSync(t.worktree)) return
  if (!projectExists()) {
    if (RUNTIME === 'mock') { t.worktree = undefined; return }
    throw new Error(`Project repo not found at ${PROJECT.path}. Set project.path in config/company.yaml or PROJECT_PATH.`)
  }
  const branch = PROJECT.branch_pattern.replace('{key}', t.key).replace('{slug}', slug(t.title))
  const wt = path.join(DATA_DIR, 'worktrees', t.key)
  mkdirSync(path.dirname(wt), { recursive: true })
  let r = await sh(`git worktree add -b ${q(branch)} ${q(wt)} ${q(PROJECT.base_branch)}`, PROJECT.path, signal)
  if (r.code !== 0 && /already exists/.test(r.out)) r = await sh(`git worktree add ${q(wt)} ${q(branch)}`, PROJECT.path, signal)
  if (r.code !== 0) throw new Error(`git worktree failed: ${r.out.trim().split('\n').pop()}`)
  t.branch = branch; t.worktree = wt
  log(t, `Worktree ready on branch ${branch}`, 'router')
}

async function hasChanges(t: Task): Promise<boolean> {
  if (RUNTIME === 'mock' || !t.worktree) return true
  return (await sh('git status --porcelain', t.worktree)).out.trim().length > 0
}

// ---------- steps ----------
const file = (t: Task, n: string) => readHandoff(t.key, n) ?? ''
/** drop chatty preamble ("Now I have a clear picture…") before the document's first heading */
const doc = (text: string) => { const i = text.search(/^#{1,3} /m); return (i > 0 ? text.slice(i) : text).replace(/^---\s*\n/, '').trim() }

/** Triage decides question vs change (and the size of a change) for tasks created with "Let HQ decide". */
async function triage(t: Task, signal: AbortSignal) {
  const text = await agent(t, 'triage', {}, signal)
  let j: { kind?: string; size?: string; why?: string } = {}
  try { j = JSON.parse([...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop()?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') } catch { /* fall through */ }
  t.kind = j.kind === 'question' ? 'question' : 'change'
  if (t.kind === 'change' && ['S', 'M', 'L'].includes(j.size ?? '')) t.size = j.size as Size
  log(t, `Triage: ${t.kind === 'question' ? 'a question, the Analyst will answer it' : `a ${t.size} change`}${j.why ? ` (${j.why})` : ''}`, 'triage')
}

async function verify(t: Task, signal: AbortSignal): Promise<{ ok: boolean; out: string }> {
  const d = await acquire('verify', t, signal)
  const s = startStep(t, 'verify', d)
  try {
    let out = '', ok = true
    for (const cmd of PROJECT.verify) {
      t.activity = `Running ${cmd.length > 50 ? cmd.slice(0, 49) + '…' : cmd}`
      const a = agents.get(d.id); if (a) a.activity = t.activity
      log(t, t.activity, d.id)
      const r = RUNTIME === 'mock' || !t.worktree ? { code: 0, out: '(mock) ok\n' } : await sh(cmd, t.worktree, signal)
      out += `$ ${cmd}\n${r.out}\n`
      if (r.code !== 0) ok = false
    }
    writeHandoff(t, 'verify.log', out)
    endStep(t, s, ok ? 'done' : 'failed', ok ? 'all checks passed' : 'checks failed')
    log(t, ok ? 'Verify: all checks passed' : 'Verify: some checks failed', d.id)
    return { ok, out }
  } finally { release(d) }
}

function parseReview(text: string): { verdict: 'approve' | 'changes'; findings: string[] } {
  const m = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop()
  try {
    const j = JSON.parse(m?.[1] ?? '{}')
    return { verdict: j.verdict === 'changes' ? 'changes' : 'approve', findings: Array.isArray(j.findings) ? j.findings.map(String) : [] }
  } catch { return { verdict: 'approve', findings: [] } }
}

async function implement(t: Task, signal: AbortSignal, fix?: string) {
  const report = await agent(t, 'implementer', { spec: file(t, 'spec.md'), plan: file(t, 'plan.md'), fix: fix ?? '' }, signal, fix ? `implementer (fix ${t.fixRound})` : 'implementer')
  writeHandoff(t, fix ? `impl-fix-${t.fixRound}.md` : 'impl.md', report)
  return report
}

/** verify, and on failure send the log back to the implementer (counts as a fix round) */
async function verifyLoop(t: Task, signal: AbortSignal) {
  for (;;) {
    const v = await verify(t, signal)
    if (v.ok) return v.out
    if (t.fixRound >= ROUTES.max_fix_rounds) { log(t, 'Verify still failing after max fix rounds; passing the log to review', 'verify'); return v.out }
    t.fixRound++
    await implement(t, signal, `The verify step failed. Fix it. Known failures that already exist on ${PROJECT.base_branch} and can be ignored: ${PROJECT.known_baseline_failures.join('; ') || 'none'}.\n\nOutput tail:\n${v.out.slice(-4000)}`)
  }
}

async function review(t: Task, signal: AbortSignal, verifyOut: string) {
  for (;;) {
    const text = await agent(t, 'primary-reviewer', { spec: file(t, 'spec.md'), verify: verifyOut.slice(-3000) }, signal)
    writeHandoff(t, 'review.md', text)
    const r = parseReview(text)
    if (r.verdict === 'approve' || t.fixRound >= ROUTES.max_fix_rounds) {
      if (r.verdict !== 'approve') log(t, 'Reviewer still has findings after max fix rounds; the CEO decides at the MR gate', 'primary-reviewer')
      return
    }
    t.fixRound++
    log(t, `Review requested changes (fix round ${t.fixRound}): ${r.findings.join('; ')}`, 'primary-reviewer')
    await implement(t, signal, r.findings.map((f) => `- ${f}`).join('\n'))
    verifyOut = await verifyLoop(t, signal)
  }
}

/** The Analyst answers the latest question; answer.md keeps the whole thread. */
async function answer(t: Task, signal: AbortSignal) {
  const qs = (t.questions ??= [[t.title, t.description].filter(Boolean).join('\n\n')])
  const question = qs[qs.length - 1]
  const previous = file(t, 'answer.md')
  const text = await agent(t, 'analyst', { question, previous }, signal, qs.length > 1 ? `analyst (follow-up ${qs.length - 1})` : 'analyst')
  const heading = qs.length > 1 ? `## Follow-up: ${question.split('\n')[0]}` : `## ${t.title}`
  writeHandoff(t, 'answer.md', `${previous ? `${previous}\n\n---\n\n` : ''}${heading}\n\n${text}`)
}

type StepResult = 'next' | 'pause' | 'finish'
async function runStep(t: Task, step: string, signal: AbortSignal): Promise<StepResult> {
  if (GATES.has(step)) {
    if (t.approvals.includes(step)) return 'next'
    t.column = COLUMN_OF[step]; t.status = 'waiting'
    t.waiting = { gate: step as 'approve-spec' | 'approve-mr', file: step === 'approve-spec' ? 'spec.md' : 'mr.md' }
    log(t, step === 'approve-spec' ? 'Spec is ready for your approval' : 'Merge request is ready for your approval', 'router')
    return 'pause'
  }
  switch (step) {
    case 'triage': return 'next' // already decided before the route started
    case 'analyst': await answer(t, signal); return 'next'
    case 'pm-lead': writeHandoff(t, 'spec.md', doc(await agent(t, 'pm-lead', {}, signal))); t.feedback = undefined; return 'next'
    case 'tech-lead': writeHandoff(t, 'plan.md', doc(await agent(t, 'tech-lead', { spec: file(t, 'spec.md') }, signal))); return 'next'
    case 'implementer': {
      const report = await implement(t, signal)
      if (!(await hasChanges(t))) {
        // nothing changed: it was really a question (or already done). Keep the report as the answer, skip verify/review/MR.
        writeHandoff(t, 'answer.md', `## ${t.title}\n\n${report}`)
        log(t, 'No code was changed, so verify, review and the MR are skipped. The implementer report is kept as the answer.', 'router')
        return 'finish'
      }
      return 'next'
    }
    case 'verify': await verifyLoop(t, signal); return 'next'
    case 'review': case 'primary-reviewer': await review(t, signal, file(t, 'verify.log')); return 'next'
    case 'mr-writer':
      writeHandoff(t, 'mr.md', await agent(t, 'mr-writer', { spec: file(t, 'spec.md'), impl: file(t, 'impl.md'), review: file(t, 'review.md') }, signal))
      t.feedback = undefined
      return 'next'
    default:
      log(t, `Skipping unknown route step "${step}"`, 'router'); return 'next'
  }
}

/** Commit on the task branch (and push when ULTRONAIR_PUSH=1). Questions and no-change tasks just close. */
async function finish(t: Task, signal: AbortSignal, commit: boolean) {
  if (commit && t.worktree && RUNTIME !== 'mock') {
    const msgFile = path.join(DATA_DIR, 'tasks', t.key, '.commit-msg')
    writeFileSync(msgFile, file(t, 'mr.md') || `${t.key} ${t.title}`)
    const r = await sh(`git add -A && git commit -q -F ${q(msgFile)} && git log -1 --format=%h`, t.worktree, signal)
    log(t, r.code === 0 ? `Committed ${r.out.trim()} on ${t.branch}` : `Nothing committed: ${r.out.trim().split('\n').pop()}`, 'release')
    if (r.code === 0 && process.env.ULTRONAIR_PUSH === '1') {
      const p = await sh(`git push -u origin ${q(t.branch!)}`, t.worktree, signal)
      log(t, p.code === 0 ? `Pushed ${t.branch}` : `Push failed: ${p.out.trim().split('\n').pop()}`, 'release')
    }
  }
  t.column = 'done'; t.status = 'done'
  const k = Math.round((t.tokens.input + t.tokens.cacheWrite + t.tokens.cacheRead + t.tokens.output) / 1000)
  log(t, `Done. ${k}k tokens in total.`, 'router')
}

/** Drive a task from its current step until it finishes, fails, or waits on the CEO. */
async function drive(t: Task) {
  if (running.has(t.key)) return
  const ac = new AbortController()
  running.set(t.key, ac)
  t.status = 'running'; t.error = undefined; t.waiting = undefined
  changed()
  try {
    if (!t.kind) await triage(t, ac.signal)
    if (t.kind === 'question' && RUNTIME !== 'mock' && !projectExists())
      throw new Error(`Project repo not found at ${PROJECT.path}. Set project.path in config/company.yaml or PROJECT_PATH.`)
    if (t.kind === 'change') await ensureWorktree(t, ac.signal)
    const route = routeFor(t)
    while (t.stepIndex < route.length) {
      const r = await runStep(t, route[t.stepIndex], ac.signal)
      if (r === 'pause') return
      if (r === 'finish') return await finish(t, ac.signal, false)
      t.stepIndex++
      changed()
    }
    await finish(t, ac.signal, t.kind === 'change')
  } catch (e) {
    t.status = 'failed'
    t.error = ac.signal.aborted ? 'Cancelled' : (e as Error).message
    log(t, `Stopped: ${t.error}`, 'router')
  } finally {
    running.delete(t.key)
    t.agentId = undefined; t.activity = undefined
    changed()
  }
}

// ---------- commands from the board ----------
let seq = 0
export function createTask(n: NewTask): Task {
  const key = (n.key?.trim() || `UA-${Date.now().toString(36).slice(-4).toUpperCase()}${seq++}`).replace(/\s+/g, '-')
  if (tasks.has(key)) throw new Error(`A task with key ${key} already exists`)
  const kind: Kind | undefined = n.kind
  const t: Task = {
    key, title: n.title.trim(), description: n.description?.trim() ?? '', kind, size: n.size ?? 'M', column: 'inbox', status: 'queued',
    createdAt: Date.now(), updatedAt: Date.now(), stepIndex: 0, fixRound: 0, approvals: [], steps: [], log: [], files: [],
    costUsd: 0, tokens: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
  }
  tasks.set(key, t)
  log(t, kind === 'question' ? `New question from the CEO: ${t.title}` : kind === 'change' ? `New ${t.size} task from the CEO: ${t.title}` : `New task from the CEO, triage will route it: ${t.title}`)
  void drive(t)
  return t
}

const get = (key: string) => { const t = tasks.get(key); if (!t) throw new Error(`No task ${key}`); return t }

export function approve(key: string) {
  const t = get(key)
  if (t.status !== 'waiting' || !t.waiting) throw new Error('This task is not waiting for approval')
  t.approvals.push(t.waiting.gate)
  log(t, `CEO approved the ${t.waiting.gate === 'approve-spec' ? 'spec' : 'merge request'}`)
  t.stepIndex++
  void drive(t)
}

export function requestChanges(key: string, feedback: string) {
  const t = get(key)
  if (t.status !== 'waiting' || !t.waiting) throw new Error('This task is not waiting for approval')
  t.feedback = feedback
  log(t, `CEO requested changes: ${feedback}`)
  // go back to the desk that wrote the document
  const route = routeFor(t)
  const author = t.waiting.gate === 'approve-spec' ? 'pm-lead' : 'mr-writer'
  const idx = route.lastIndexOf(author, t.stepIndex)
  if (idx >= 0) t.stepIndex = idx
  void drive(t)
}

/** Ask a follow-up on a question; the Analyst answers with the earlier thread as context. */
export function followUp(key: string, question: string) {
  const t = get(key)
  if (t.kind !== 'question') throw new Error('Follow-ups are for questions')
  if (running.has(key)) throw new Error('Wait for the current answer first')
  ;(t.questions ??= [[t.title, t.description].filter(Boolean).join('\n\n')]).push(question)
  log(t, `CEO asked a follow-up: ${question}`)
  t.stepIndex = Math.max(0, routeFor(t).indexOf('analyst'))
  void drive(t)
}

export function retry(key: string) {
  const t = get(key)
  if (t.status !== 'failed') throw new Error('Only failed tasks can be retried')
  log(t, 'CEO pressed Retry')
  void drive(t)
}

export function cancel(key: string) {
  const t = get(key)
  const ac = running.get(key)
  if (ac) ac.abort()
  else if (t.status === 'waiting') { t.status = 'failed'; t.error = 'Cancelled'; t.waiting = undefined; log(t, 'Cancelled by the CEO'); changed() }
}

export async function removeTask(key: string) {
  const t = get(key)
  if (running.has(key)) throw new Error('Cancel the task first')
  if (t.worktree && existsSync(t.worktree)) await sh(`git worktree remove --force ${q(t.worktree)}`, PROJECT.path)
  tasks.delete(key)
  changed()
}
