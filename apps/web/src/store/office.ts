import { create } from 'zustand'
import type { Agent, AgentId, OfficeEvent, Project, ProjectId, Task, TaskId } from '../model/types'

export interface Hover { agentId: AgentId; x: number; y: number }

interface OfficeState {
  connected: boolean
  projects: Record<ProjectId, Project>
  agents: Record<AgentId, Agent>
  tasks: Record<TaskId, Task>
  /** newest first */
  feed: OfficeEvent[]
  selectedAgentId?: AgentId
  filterProjectId?: ProjectId
  /** bumps when the camera should move; the scene reads it */
  focus: { projectId?: ProjectId; n: number }
  hover?: Hover
  apply: (e: OfficeEvent) => void
  setConnected: (c: boolean) => void
  select: (id?: AgentId) => void
  setFilter: (id?: ProjectId) => void
  focusRoom: (id?: ProjectId) => void
  setHover: (h?: Hover) => void
}

type Listener = (e: OfficeEvent) => void
const listeners = new Set<Listener>()
/** One-shot effects (confetti, tool icons, bubbles) subscribe here; persistent state lives in the store. */
export const onOfficeEvent = (l: Listener) => { listeners.add(l); return () => listeners.delete(l) }

const FEED_MAX = 300
const LOG_MAX = 200

export const useOffice = create<OfficeState>()((set) => ({
  connected: false,
  projects: {},
  agents: {},
  tasks: {},
  feed: [],
  focus: { n: 0 },
  setConnected: (connected) => set({ connected }),
  select: (selectedAgentId) => set({ selectedAgentId }),
  setFilter: (filterProjectId) => set((s) => ({ filterProjectId, focus: { projectId: filterProjectId, n: s.focus.n + 1 } })),
  focusRoom: (projectId) => set((s) => ({ focus: { projectId, n: s.focus.n + 1 } })),
  setHover: (hover) => set({ hover }),
  apply: (e) => {
    set((s) => reduce(s, e))
    listeners.forEach((l) => l(e))
  },
}))

function reduce(s: OfficeState, e: OfficeEvent): Partial<OfficeState> {
  if (e.type === 'snapshot') {
    const p = e.payload
    return {
      projects: Object.fromEntries(p.projects.map((x) => [x.id, x])),
      agents: Object.fromEntries(p.agents.map((a) => [a.id, { ...a, status: 'idle', pastTaskIds: [] } as Agent])),
      tasks: Object.fromEntries((p.tasks ?? []).map((t) => [t.id, t])),
      feed: [],
    }
  }

  const tasks = { ...s.tasks }
  const agents = { ...s.agents }
  let task = tasks[e.taskId]
  if (!task && e.type === 'task_assigned') {
    task = {
      id: e.taskId, title: e.payload.title, description: e.payload.description ?? '', projectId: e.payload.projectId,
      status: 'queued', progress: 0, log: [], createdAt: e.timestamp,
    }
  }
  if (!task) return { feed: [e, ...s.feed].slice(0, FEED_MAX) }
  task = { ...task, log: [...task.log, { ts: e.timestamp, type: e.type, text: describe(e, s) }].slice(-LOG_MAX) }
  const agent = e.agentId ? agents[e.agentId] : undefined
  const setAgent = (patch: Partial<Agent>) => { if (agent) agents[agent.id] = { ...agent, ...patch } }

  switch (e.type) {
    case 'task_assigned':
      task.agentId = e.agentId || undefined
      if (agent) setAgent({ taskId: task.id })
      break
    case 'task_started':
      task.status = 'in_progress'
      task.startedAt ??= e.timestamp
      setAgent({ status: 'working', taskId: task.id, waitingOn: undefined })
      break
    case 'progress':
      task.progress = Math.max(0, Math.min(100, e.payload.progress))
      break
    case 'blocked':
      task.status = 'blocked'
      setAgent({ status: 'blocked', waitingOn: e.payload.waitingOn })
      break
    case 'review':
      task.status = 'review'
      setAgent({ status: 'review', waitingOn: undefined, reviewerId: e.payload.reviewerId })
      break
    case 'completed':
    case 'failed':
      task.status = e.type === 'completed' ? 'done' : 'failed'
      if (e.type === 'completed') task.progress = 100
      task.finishedAt = e.timestamp
      if (agent) setAgent({ status: 'idle', taskId: undefined, waitingOn: undefined, reviewerId: undefined, pastTaskIds: [task.id, ...agent.pastTaskIds].slice(0, 50) })
      break
  }
  tasks[task.id] = task
  return { tasks, agents, feed: [e, ...s.feed].slice(0, FEED_MAX) }
}

const cut = (t: string, n = 60) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

/** One human sentence per event, used by the feed, the agent timeline and task logs. */
export function describe(e: OfficeEvent, s: Pick<OfficeState, 'agents' | 'tasks'> = useOffice.getState()): string {
  const who = s.agents[e.agentId]?.name ?? 'Someone'
  const title = s.tasks[e.taskId]?.title ?? (e.type === 'task_assigned' ? e.payload.title : e.taskId)
  switch (e.type) {
    case 'snapshot': return 'Office opened'
    case 'task_assigned': return e.agentId ? `${who} picked up “${cut(title, 40)}”` : `“${cut(title, 40)}” is waiting for someone`
    case 'task_started': return `${who} is working on “${cut(title, 40)}”`
    case 'progress': return `${who} is ${Math.round(e.payload.progress)}% through “${cut(title, 32)}”`
    case 'tool_call': return `${who} opened the ${e.payload.tool}${e.payload.label ? ` (${cut(e.payload.label, 30)})` : ''}`
    case 'message': return `${who} ${e.payload.kind === 'think' ? 'thinks' : 'says'}: ${cut(e.payload.text)}`
    case 'blocked': return `${who} is blocked: ${cut(e.payload.reason)}${e.payload.waitingOn ? ` (waiting on ${s.agents[e.payload.waitingOn]?.name ?? 'a teammate'})` : ''}`
    case 'review': return `${who} took “${cut(title, 36)}” to review`
    case 'completed': return `${who} finished “${cut(title, 40)}”`
    case 'failed': return `${who} could not finish “${cut(title, 32)}”: ${cut(e.payload.reason, 40)}`
  }
}
