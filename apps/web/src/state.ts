import { DESK, MODELS } from './company'
import type { Gate, Status, Task, UEvent } from './types'

export interface AgentState { status: Status; activity: string; task: string; tin: number; tout: number; usd: number }
export interface Arrow { id: number; from: string; to: string; kind: string }
export interface LogEntry { n: number; ts: number; agent?: string; text: string }
export interface State {
  t0: number
  agents: Record<string, AgentState>
  tasks: Task[]
  gates: Gate[]
  log: LogEntry[]
  arrows: Arrow[]
  spent: number
  tin: number
  tout: number
  byDept: Record<string, number>
  byModel: Record<string, number>
}

export const init = (): State => ({
  t0: Date.now(),
  agents: Object.fromEntries(
    Object.keys(DESK).map((id) => [id, { status: 'idle', activity: 'idle', task: '', tin: 0, tout: 0, usd: 0 } as AgentState]),
  ),
  tasks: [], gates: [], log: [], arrows: [], spent: 0, tin: 0, tout: 0, byDept: {}, byModel: {},
})

let n = 0
export function reduce(s: State, e: UEvent): State {
  switch (e.t) {
    case 'agent.status': {
      const a = s.agents[e.agent]
      return { ...s, agents: { ...s.agents, [e.agent]: { ...a, status: e.status, activity: e.activity ?? a.activity, task: e.task ?? a.task } } }
    }
    case 'agent.usage': {
      const d = DESK[e.agent]
      if (!d.model) return s
      const m = MODELS[d.model]
      const usd = (e.tin * m.in + e.tout * m.out) / 1e6
      const a = s.agents[e.agent]
      return {
        ...s,
        agents: { ...s.agents, [e.agent]: { ...a, tin: a.tin + e.tin, tout: a.tout + e.tout, usd: a.usd + usd } },
        tasks: s.tasks.map((t) => (t.key === e.task ? { ...t, usd: t.usd + usd } : t)),
        spent: s.spent + usd, tin: s.tin + e.tin, tout: s.tout + e.tout,
        byDept: { ...s.byDept, [d.dept]: (s.byDept[d.dept] ?? 0) + usd },
        byModel: { ...s.byModel, [d.model]: (s.byModel[d.model] ?? 0) + usd },
      }
    }
    case 'agent.message':
      return { ...s, arrows: [...s.arrows, { id: e.id, from: e.from, to: e.to, kind: e.kind }] }
    case 'arrow.expire':
      return { ...s, arrows: s.arrows.filter((a) => a.id !== e.id) }
    case 'task.upsert': {
      const has = s.tasks.some((t) => t.key === e.task.key)
      return { ...s, tasks: has ? s.tasks.map((t) => (t.key === e.task.key ? e.task : t)) : [...s.tasks, e.task] }
    }
    case 'approval.needed':
      return { ...s, gates: [...s.gates, e.gate] }
    case 'approval.resolved':
      return { ...s, gates: s.gates.filter((g) => g.id !== e.id) }
    case 'log':
      return { ...s, log: [{ n: n++, ts: Date.now(), agent: e.agent, text: e.text }, ...s.log].slice(0, 80) }
  }
}
