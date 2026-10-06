/** Types shared by the HQ server and the task board. */
export type Size = 'S' | 'M' | 'L'
/** question = answer it from the code, change nothing; change = code work routed by size */
export type Kind = 'question' | 'change'

/** Board columns, left to right. Failed tasks keep their column and get a red badge. */
export const COLUMNS = ['inbox', 'answer', 'spec', 'approve_spec', 'build', 'verify', 'review', 'mr', 'approve_mr', 'done'] as const
export type Column = (typeof COLUMNS)[number]
export const COLUMN_LABEL: Record<Column, string> = {
  inbox: 'Inbox', answer: 'Answering', spec: 'Spec', approve_spec: 'Approve spec', build: 'Build', verify: 'Verify',
  review: 'Review', mr: 'MR draft', approve_mr: 'Approve MR', done: 'Done',
}

export type TaskStatus = 'queued' | 'running' | 'waiting' | 'done' | 'failed'

export interface Tokens { input: number; cacheWrite: number; cacheRead: number; output: number }
export const tokenTotal = (t?: Tokens) => (t ? t.input + t.cacheWrite + t.cacheRead + t.output : 0)

export interface Step {
  /** route step from company.yaml, e.g. "pm-lead", "verify" */
  name: string
  agentId?: string
  agentName?: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
  costUsd?: number
  tokens?: Tokens
  note?: string
}

export interface LogLine { ts: number; agent?: string; text: string }

export interface Task {
  key: string
  title: string
  description: string
  /** unset until triage decides (tasks created with "Let HQ decide") */
  kind?: Kind
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
  /** questions asked on this task so far; the last one is being answered */
  questions?: string[]
  /** set while waiting on the CEO */
  waiting?: { gate: 'approve-spec' | 'approve-mr'; file: string }
  steps: Step[]
  log: LogLine[]
  /** handoff files written so far (spec.md, plan.md, …) */
  files: string[]
  /** list-price equivalent from Claude Code; kept for reference, the board shows tokens */
  costUsd: number
  tokens: Tokens
  /** 5-hour session meter (%) when the task's first agent started and at its latest run */
  session?: { start: number; end: number }
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

/** Your Claude plan limits as Claude Code last reported them. */
export interface Usage {
  fiveHour?: { pct: number; resetsAt: number }
  sevenDay?: { pct: number; resetsAt: number }
  updatedAt?: number
}

export interface KitItem { name: string; description?: string; source: 'kit' | 'project' }
/** Skills, agents, commands and rules the agents can use. */
export interface Kit { skills: KitItem[]; agents: KitItem[]; commands: KitItem[]; rules: KitItem[] }

export interface BoardState {
  runtime: 'claude' | 'mock'
  project: { id: string; path: string; exists: boolean; baseBranch: string }
  departments: Dept[]
  agents: AgentView[]
  tasks: Task[]
  usage: Usage
  kit: Kit
}

/** kind/size omitted = let triage decide */
export interface NewTask { title: string; description: string; kind?: Kind; size?: Size; key?: string }
