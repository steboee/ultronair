/** Types shared by the HQ server and the task board. */
export type Size = 'S' | 'M' | 'L'

/** Board columns, left to right. Failed tasks keep their column and get a red badge. */
export const COLUMNS = ['inbox', 'spec', 'approve_spec', 'build', 'verify', 'review', 'mr', 'approve_mr', 'done'] as const
export type Column = (typeof COLUMNS)[number]
export const COLUMN_LABEL: Record<Column, string> = {
  inbox: 'Inbox', spec: 'Spec', approve_spec: 'Approve spec', build: 'Build', verify: 'Verify',
  review: 'Review', mr: 'MR draft', approve_mr: 'Approve MR', done: 'Done',
}

export type TaskStatus = 'queued' | 'running' | 'waiting' | 'done' | 'failed'

export interface Step {
  /** route step from company.yaml, e.g. "pm-lead", "verify" */
  name: string
  agentId?: string
  agentName?: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
  costUsd?: number
  note?: string
}

export interface LogLine { ts: number; agent?: string; text: string }

export interface Task {
  key: string
  title: string
  description: string
  size: Size
  column: Column
  status: TaskStatus
  createdAt: number
  updatedAt: number
  branch?: string
  worktree?: string
  /** position in the size's route (company.yaml `routes`) */
  stepIndex: number
  fixRound: number
  approvals: string[]
  /** CEO's "request changes" note, consumed by the next agent run */
  feedback?: string
  /** set while waiting on the CEO */
  waiting?: { gate: 'approve-spec' | 'approve-mr'; file: string }
  steps: Step[]
  log: LogLine[]
  /** handoff files written so far (spec.md, plan.md, …) */
  files: string[]
  costUsd: number
  error?: string
  /** who is on it right now and what they are doing */
  agentId?: string
  activity?: string
}

export interface AgentView {
  id: string
  name: string
  role: string
  dept: string
  kind: 'orchestrator' | 'worker' | 'code'
  model?: string
  status: 'idle' | 'working'
  taskKey?: string
  activity?: string
}

export interface Dept { id: string; name: string; color: string }

export interface BoardState {
  runtime: 'claude' | 'mock'
  project: { id: string; path: string; exists: boolean; baseBranch: string }
  departments: Dept[]
  agents: AgentView[]
  tasks: Task[]
}

export interface NewTask { title: string; description: string; size: Size; key?: string }
