export type ProjectId = string
export type AgentId = string
export type TaskId = string

export interface Project {
  id: ProjectId
  name: string
  /** hex color, e.g. "#6cb4ee" */
  color: string
  /** room slot on the office grid (column, row) */
  room: { col: number; row: number }
}

export type Role = 'backend' | 'frontend' | 'devops' | 'reviewer' | 'qa' | 'designer'
export type Accessory = 'none' | 'headphones' | 'glasses' | 'cap' | 'bow' | 'beanie' | 'antenna'
/** What the agent is doing right now. One-shot moments (done, failed, tool calls) arrive as events. */
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'review'

export interface Agent {
  id: AgentId
  name: string
  role: Role
  color: string
  accessory: Accessory
  projectId: ProjectId
  status: AgentStatus
  taskId?: TaskId
  /** set while blocked on another agent: they walk over to that agent's desk */
  waitingOn?: AgentId
  /** set while in review: the reviewer joins them at the meeting table */
  reviewerId?: AgentId
  pastTaskIds: TaskId[]
}

export type TaskStatus = 'queued' | 'in_progress' | 'blocked' | 'review' | 'done' | 'failed'
export const TASK_STATUSES: TaskStatus[] = ['queued', 'in_progress', 'blocked', 'review', 'done', 'failed']

export interface LogEntry { ts: number; type: EventType; text: string }

export interface Task {
  id: TaskId
  title: string
  description: string
  projectId: ProjectId
  agentId?: AgentId
  status: TaskStatus
  /** 0..100 */
  progress: number
  log: LogEntry[]
  createdAt: number
  startedAt?: number
  finishedAt?: number
}

export type Tool = 'terminal' | 'browser' | 'file' | 'database'

export type EventType =
  | 'snapshot'
  | 'task_assigned'
  | 'task_started'
  | 'progress'
  | 'tool_call'
  | 'message'
  | 'blocked'
  | 'review'
  | 'completed'
  | 'failed'

export interface PayloadMap {
  snapshot: { projects: Project[]; agents: Omit<Agent, 'pastTaskIds' | 'status'>[]; tasks?: Task[] }
  task_assigned: { title: string; description?: string; projectId: ProjectId }
  task_started: Record<string, never>
  progress: { progress: number; note?: string }
  tool_call: { tool: Tool; label?: string }
  message: { text: string; kind?: 'say' | 'think' }
  blocked: { reason: string; waitingOn?: AgentId }
  review: { reviewerId?: AgentId }
  completed: { summary?: string }
  failed: { reason: string }
}

/** The wire format. Every source (mock, WebSocket, SSE) produces exactly this. */
export type OfficeEvent = {
  [K in EventType]: {
    type: K
    /** empty for snapshot; may be empty for task_assigned (= queued, no agent yet) */
    agentId: AgentId
    taskId: TaskId
    payload: PayloadMap[K]
    /** ms since epoch */
    timestamp: number
  }
}[EventType]

export interface NewTaskInput {
  title: string
  description: string
  projectId: ProjectId
  /** omit for auto-assign */
  agentId?: AgentId
}
