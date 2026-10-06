import type { Accessory, Agent, NewTaskInput, OfficeEvent, PayloadMap, Project, Role, Tool } from '../model/types'
import type { EventSource } from './source'

// ---------- seed: 8 rooms, 24 agents ----------
const PROJECTS: Project[] = [
  { id: 'iad-be', name: 'IAD Backend', color: '#6cb4ee', room: { col: 0, row: 0 } },
  { id: 'onboarding', name: 'Onboarding', color: '#5cc9a7', room: { col: 1, row: 0 } },
  { id: 'investments', name: 'Investments', color: '#f6c453', room: { col: 2, row: 0 } },
  { id: 'identity', name: 'Identity', color: '#b39ddb', room: { col: 3, row: 0 } },
  { id: 'ultronair', name: 'Ultronair HQ', color: '#ff8a7a', room: { col: 0, row: 1 } },
  { id: 'marketing', name: 'Marketing Site', color: '#f48fb1', room: { col: 1, row: 1 } },
  { id: 'analytics', name: 'Analytics', color: '#4fb3bf', room: { col: 2, row: 1 } },
  { id: 'devops', name: 'Platform', color: '#ffb38a', room: { col: 3, row: 1 } },
]
const NAMES = ['Mia', 'Leo', 'Ada', 'Kai', 'Noa', 'Eli', 'Zoe', 'Max', 'Ivy', 'Oto', 'Lu', 'Ren', 'Sky', 'Bo', 'Fin', 'Ola',
  'Juno', 'Pip', 'Tess', 'Remy', 'Nia', 'Ash', 'Kit', 'Vik']
const ROLES: Role[][] = [
  ['backend', 'backend', 'reviewer'], ['frontend', 'backend', 'qa'], ['backend', 'frontend', 'reviewer'], ['backend', 'devops', 'reviewer'],
  ['backend', 'frontend', 'reviewer'], ['frontend', 'designer', 'qa'], ['backend', 'frontend', 'reviewer'], ['devops', 'devops', 'reviewer'],
]
const ACCS: Accessory[] = ['headphones', 'glasses', 'cap', 'bow', 'beanie', 'none', 'antenna']
const BODY = ['#7aa2ff', '#ff9e7a', '#66c2a5', '#c792ea', '#ffd166', '#ef8fb3', '#5ec4d6', '#a3be8c', '#f4a259', '#8d99ff']
const AGENTS: Omit<Agent, 'pastTaskIds' | 'status'>[] = PROJECTS.flatMap((p, pi) =>
  ROLES[pi].map((role, k) => {
    const i = pi * 3 + k
    return { id: `a${i + 1}`, name: NAMES[i], role, color: BODY[(i * 7) % BODY.length], accessory: ACCS[(i * 3 + pi) % ACCS.length], projectId: p.id }
  }),
)

const TITLES: Record<Role, string[]> = {
  backend: ['Add resume-later link to onboarding', 'Fix portfolio rounding', 'Paginate transactions API', 'Cache fund NAV lookups', 'Retry Insyko KYC webhook', 'Split OnboardingService', 'Validate payment requests'],
  frontend: ['Polish questionnaire step 3', 'Dark mode for dashboard', 'Fix chart tooltip overflow', 'Skeleton loaders on lists', 'Accessible form errors'],
  devops: ['Speed up CI cache', 'Rotate staging secrets', 'Add pgsql backup check', 'Upgrade PHP to 8.4', 'Alert on queue lag'],
  reviewer: ['Review payment MR', 'Audit permission rules', 'Review contract templates'],
  qa: ['Regression pass on onboarding', 'Write e2e for login', 'Verify SMS templates'],
  designer: ['Landing hero refresh', 'Icon set for funds', 'Empty states'],
}
const SAY = ['Found the bug!', 'Tests are green', 'Hmm, legacy owns this table', 'Pushing a fix', 'Can I get a review?', 'This needs a migration', 'Coffee first', 'Adding a test for that', 'Nice, that was quick']
const THINK = ['Where is this called from?', 'Maybe a race condition…', 'Which service owns this?', 'Should this be cached?', 'Edge case: empty list', 'Reading the spec again']
const BLOCK = ['Needs an answer from the reviewer', 'Waiting for API contract', 'Staging DB is down', 'Unclear requirement']
const TOOLS: Tool[] = ['terminal', 'browser', 'file', 'database']
const TOOL_LABEL: Record<Tool, string[]> = {
  terminal: ['running tests', 'git status'], browser: ['reading docs', 'checking staging'], file: ['OnboardingService.php', 'routes.php', 'Dashboard.tsx'], database: ['portfolio table', 'migrations'],
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

type Phase = 'idle' | 'assigned' | 'working' | 'blocked' | 'review'
interface Sim { id: string; projectId: string; role: Role; phase: Phase; taskId?: string; progress: number; next: number; blockedOn?: string }

/** A self-running fake company. It emits exactly what a real backend would. */
export class MockSource implements EventSource {
  private sims: Sim[] = AGENTS.map((a) => ({ id: a.id, projectId: a.projectId, role: a.role, phase: 'idle', progress: 0, next: Date.now() + rnd(500, 6000) }))
  private queue: { taskId: string; input: NewTaskInput }[] = []
  private emit: (e: OfficeEvent) => void = () => {}
  private seq = 100
  private speed = 1
  private timer?: ReturnType<typeof setInterval>

  connect(emit: (e: OfficeEvent) => void, status: (c: boolean) => void) {
    this.emit = emit
    this.send('snapshot', '', '', { projects: PROJECTS, agents: AGENTS })
    status(true)
    // warm start: a few people are already busy when the office opens
    this.sims.filter((_, i) => i % 3 !== 2).forEach((s) => this.assign(s, pick(TITLES[s.role]), '', true))
    this.timer = setInterval(() => this.tick(), 200)
    return () => clearInterval(this.timer)
  }

  setSpeed(n: number) { this.speed = n }

  createTask(input: NewTaskInput) {
    const taskId = `T-${++this.seq}`
    const target = input.agentId
      ? this.sims.find((s) => s.id === input.agentId)
      : this.sims.find((s) => s.projectId === input.projectId && s.phase === 'idle' && s.role !== 'reviewer') ??
        this.sims.find((s) => s.projectId === input.projectId && s.phase === 'idle')
    if (target && target.phase === 'idle') return this.assign(target, input.title, input.description, false, taskId)
    // nobody free: queue it and hand it out when someone is
    this.send('task_assigned', '', taskId, { title: input.title, description: input.description, projectId: input.projectId })
    this.queue.push({ taskId, input })
  }

  private send<K extends keyof PayloadMap>(type: K, agentId: string, taskId: string, payload: PayloadMap[K]) {
    this.emit({ type, agentId, taskId, payload, timestamp: Date.now() } as OfficeEvent)
  }
  private later(s: Sim, a: number, b: number) { s.next = Date.now() + rnd(a, b) / this.speed }

  private assign(s: Sim, title: string, description = '', midway = false, taskId = `T-${++this.seq}`) {
    s.taskId = taskId
    s.phase = 'assigned'
    s.progress = midway ? rnd(10, 60) : 0
    this.send('task_assigned', s.id, taskId, { title, description, projectId: s.projectId })
    this.later(s, 800, 2500)
  }

  private tick() {
    const now = Date.now()
    for (const s of this.sims) {
      if (now < s.next) continue
      const t = s.taskId ?? ''
      switch (s.phase) {
        case 'idle': {
          const q = this.queue.findIndex((x) => (x.input.agentId ? x.input.agentId === s.id : x.input.projectId === s.projectId))
          if (q >= 0) {
            const { taskId, input } = this.queue.splice(q, 1)[0]
            s.taskId = taskId; s.phase = 'assigned'; s.progress = 0
            this.send('task_assigned', s.id, taskId, { title: input.title, description: input.description, projectId: s.projectId })
            this.later(s, 800, 2000)
          } else if (Math.random() < 0.35) this.assign(s, pick(TITLES[s.role]))
          else this.later(s, 4000, 14000)
          break
        }
        case 'assigned':
          s.phase = 'working'
          this.send('task_started', s.id, t, {})
          this.later(s, 1200, 2500)
          break
        case 'working': {
          const r = Math.random()
          if (s.progress >= 85) {
            s.phase = 'review'
            const reviewer = this.sims.find((x) => x.projectId === s.projectId && x.role === 'reviewer' && x.id !== s.id)
            this.send('review', s.id, t, { reviewerId: reviewer?.id })
            this.later(s, 5000, 9000)
          } else if (r < 0.06 && s.progress > 20) {
            s.phase = 'blocked'
            const mate = pick(this.sims.filter((x) => x.projectId === s.projectId && x.id !== s.id))
            s.blockedOn = Math.random() < 0.7 ? mate?.id : undefined
            this.send('blocked', s.id, t, { reason: pick(BLOCK), waitingOn: s.blockedOn })
            this.later(s, 5000, 9000)
          } else if (r < 0.3) {
            const tool = pick(TOOLS)
            this.send('tool_call', s.id, t, { tool, label: pick(TOOL_LABEL[tool]) })
            this.later(s, 1500, 3500)
          } else if (r < 0.48) {
            const think = Math.random() < 0.5
            this.send('message', s.id, t, { text: pick(think ? THINK : SAY), kind: think ? 'think' : 'say' })
            this.later(s, 2000, 4000)
          } else {
            s.progress = Math.min(100, s.progress + rnd(6, 16))
            this.send('progress', s.id, t, { progress: Math.round(s.progress) })
            this.later(s, 1500, 3500)
          }
          break
        }
        case 'blocked':
          s.phase = 'working'
          if (s.blockedOn) this.send('message', s.id, t, { text: 'Thanks, got it!', kind: 'say' })
          s.blockedOn = undefined
          this.send('task_started', s.id, t, {})
          this.later(s, 1500, 3000)
          break
        case 'review':
          if (Math.random() < 0.88) this.send('completed', s.id, t, { summary: 'Merged after review' })
          else this.send('failed', s.id, t, { reason: pick(['Tests fail on CI', 'Reviewer rejected the approach', 'Requirement changed']) })
          s.phase = 'idle'; s.taskId = undefined; s.progress = 0
          this.later(s, 4000, 10000)
          break
      }
    }
  }
}
