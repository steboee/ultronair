import type { Bus, NewTask, Runtime, Status, Task } from './types'

const FILES = [
  'plugins/apponboarding/classes/OnboardingService.php',
  'plugins/apponboarding/classes/QuestionnaireResume.php',
  'plugins/apponboarding/http/OnboardingController.php',
  'plugins/apponboarding/routes.php',
  'plugins/apponboarding/lang/en/lang.php',
  'plugins/apponboarding/tests/ResumeLinkTest.php',
]

/**
 * Scripted stand-in for the real runtime. It emits the same UEvents the Agent SDK
 * runtime will, so the UI never needs to know the difference.
 */
export class SimRuntime implements Runtime {
  private speed = 2
  private paused = false
  private auto = false
  private dead = false
  private running = false
  private queue: Task[] = []
  private resumers: (() => void)[] = []
  private gates = new Map<string, () => void>()
  private msgId = 0
  private cur: Task | null = null

  constructor(private bus: Bus) {}

  submit(t: NewTask) {
    const task: Task = { ...t, col: 'queued', usd: 0 }
    this.queue.push(task)
    this.bus({ t: 'task.upsert', task })
    void this.pump()
  }
  approve(id: string) { this.gates.get(id)?.() }
  setSpeed(n: number) { this.speed = n }
  setAuto(a: boolean) { this.auto = a }
  setPaused(p: boolean) {
    this.paused = p
    if (!p) { const r = this.resumers; this.resumers = []; r.forEach((f) => f()) }
  }
  stop() { this.dead = true }

  // ---- plumbing ----
  private wait(ms: number) {
    return new Promise<void>((res, rej) =>
      setTimeout(() => {
        if (this.dead) return rej(new Error('stopped'))
        if (this.paused) { this.resumers.push(res); return }
        res()
      }, ms / this.speed),
    )
  }
  private log(text: string, agent?: string) { this.bus({ t: 'log', agent, text }) }
  private set(agent: string, status: Status, activity?: string) {
    this.bus({ t: 'agent.status', agent, status, activity, task: this.cur?.key })
  }
  private use(agent: string, tin: number, tout: number) {
    this.bus({ t: 'agent.usage', agent, tin, tout, task: this.cur?.key })
  }
  private msg(from: string, to: string, kind: string) {
    this.bus({ t: 'agent.message', id: ++this.msgId, from, to, kind })
    this.log(`${kind} → ${to}`, from)
  }
  private async work(id: string, status: Status, act: string, ms: number, tin = 0, tout = 0) {
    this.set(id, status, act); this.log(act, id)
    await this.wait(ms); this.use(id, tin, tout)
  }
  private done(id: string, act = 'done') { this.set(id, 'done', act) }
  private rest(ids: string[]) { ids.forEach((i) => this.set(i, 'idle', 'idle')) }
  private move(col: Task['col']) {
    if (!this.cur) return
    this.cur = { ...this.cur, col }
    this.bus({ t: 'task.upsert', task: this.cur })
    this.log(`${this.cur.key} → ${col}`, 'router')
  }
  private gate(what: string, title: string, body: string) {
    if (this.auto) { this.log(`auto-approved ${what}`); return Promise.resolve() }
    const id = `${what}-${++this.msgId}`
    return new Promise<void>((res) => {
      this.gates.set(id, () => { this.gates.delete(id); this.bus({ t: 'approval.resolved', id }); this.log(`approved ${what}`); res() })
      this.bus({ t: 'approval.needed', gate: { id, title, what, body } })
    })
  }

  private async pump() {
    if (this.running) return
    this.running = true
    try {
      while (!this.dead) {
        const t = this.queue.shift()
        if (!t) break
        await this.run(t)
      }
    } catch { /* stopped */ }
    this.running = false
  }

  // ---- the company at work ----
  private async run(task: Task) {
    this.cur = task
    const S = task.size === 'S', L = task.size === 'L'
    this.log(`new task ${task.key} (${task.size}): ${task.title}`)
    this.move('inbox')
    await this.work('router', 'tool', `creating worktree ${task.key.toLowerCase()}`, 900)

    if (!S) {
      await this.work('triage', 'thinking', 'sizing task, picking route', 1100, 2400, 260)
      this.msg('router', 'triage', 'brief'); this.done('triage', `route ${task.size}`); await this.wait(300)
      this.move('spec')
      this.msg('router', 'pm-lead', 'brief')
      this.set('pm-lead', 'thinking', 'reading brief'); await this.wait(700); this.use('pm-lead', 5200, 420)
      this.msg('pm-lead', 'scout-1', 'brief'); this.msg('pm-lead', 'scout-2', 'brief')
      await Promise.all([
        this.work('scout-1', 'tool', 'grep "questionnaire"', 1800, 3100, 380),
        this.work('scout-2', 'tool', 'read OnboardingService', 2300, 4200, 520),
      ])
      this.done('scout-1', 'findings 31 lines'); this.done('scout-2', 'findings 28 lines')
      this.msg('scout-1', 'pm-lead', 'report'); this.msg('scout-2', 'pm-lead', 'report')
      if (L) {
        this.msg('pm-lead', 'legacy-analyst', 'brief')
        await this.work('legacy-analyst', 'tool', 'read gateway client', 1600, 5200, 460)
        this.done('legacy-analyst', 'findings 22 lines'); this.msg('legacy-analyst', 'pm-lead', 'report')
      }
      await this.work('pm-lead', 'thinking', 'writing spec.md', 2200, 6400, 1700)
      this.rest(['scout-1', 'scout-2', 'legacy-analyst', 'triage'])
      this.set('pm-lead', 'waiting', 'spec ready, waiting for CEO')
      await this.gate('spec', `${task.key} spec`, `Goal: ${task.title}\nScope: ${FILES.length} files in plugins/apponboarding\nOpen question: SMS copy owner?\nRisks: legacy data owner, no model validation`)
      this.done('pm-lead', 'spec approved'); this.msg('pm-lead', 'router', 'handoff')
      this.move('build'); this.msg('router', 'tech-lead', 'brief')
      await this.work('tech-lead', 'thinking', 'planning units of work', 2000, 8200, 1500)
      this.rest(['pm-lead'])
    } else this.move('build')

    const impls = S ? ['implementer-1'] : ['implementer-1', 'implementer-2']
    if (S) this.msg('router', 'implementer-1', 'brief')
    else impls.forEach((i) => this.msg('tech-lead', i, 'brief'))
    await Promise.all(impls.map(async (id, k) => {
      for (let j = 0; j < 3; j++) {
        const f = FILES[(k * 3 + j) % FILES.length].split('/').pop()
        await this.work(id, 'tool', j === 2 ? 'composer test' : `edit ${f}`, 1500 + Math.random() * 900, 9000, 1400)
      }
      this.done(id, `impl-${k + 1}.md written`)
    }))
    if (!S) {
      impls.forEach((i) => this.msg(i, 'tech-lead', 'report'))
      await this.work('tech-lead', 'thinking', 'merging impl reports', 1000, 4800, 600)
      this.rest(['tech-lead'])
    }

    this.move('verify')
    for (const cmd of ['composer test', 'pint --dirty', 'deploy/checks'])
      await this.work('verify', 'tool', `running ${cmd}`, 1100)
    this.done('verify', 'all green')

    this.move('review')
    await this.work('reviewer-picker', 'tool', 'diff touches routes.php', 700)
    this.done('reviewer-picker', 'picked primary + security')
    const revs = S ? ['primary-reviewer'] : ['primary-reviewer', 'security-reviewer']
    revs.forEach((r) => this.msg('reviewer-picker', r, 'diff'))
    await Promise.all(revs.map((id, k) => this.work(id, 'thinking', 'reviewing diff', 2400 + k * 700, 12000, 1100)))
    this.done('primary-reviewer', '1 finding: missing test')
    if (!S) this.done('security-reviewer', 'no findings')
    this.msg('primary-reviewer', 'implementer-1', 'findings')
    this.move('build')
    await this.work('implementer-1', 'tool', 'fix round 1/2', 1800, 9500, 1000)
    await this.work('verify', 'tool', 're-running composer test', 1000)
    this.move('review')
    await this.work('primary-reviewer', 'thinking', 're-checking fix', 1300, 8800, 500)
    this.done('primary-reviewer', 'approved')
    this.rest([...impls, 'security-reviewer', 'reviewer-picker', 'verify'])

    this.move('verify')
    this.msg('router', 'mr-writer', 'handoff')
    await this.work('mr-writer', 'thinking', 'drafting MR description', 1500, 3200, 700)
    this.set('mr-writer', 'waiting', 'MR draft ready, waiting for CEO')
    await this.gate('merge request', `${task.key} MR`, `Title: ${task.key} ${task.title}\nBranch: ${task.key.toLowerCase()}/resume-later\nVerify: green · Review: approved after 1 fix round`)
    await this.work('release', 'tool', 'git push + glab mr create', 1200)
    await this.work('ci-poller', 'tool', 'watching pipeline', 1800)
    this.done('ci-poller', 'pipeline passed'); this.done('release', 'MR opened')
    this.move('done')
    this.log(`${task.key} finished`)
    this.rest(['mr-writer', 'release', 'ci-poller', 'router', 'triage', 'tech-lead'])
    this.cur = null
  }
}
