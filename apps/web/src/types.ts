export type Status = 'idle' | 'thinking' | 'tool' | 'waiting' | 'blocked' | 'done'
export type Size = 'S' | 'M' | 'L'
export type Col = 'queued' | 'inbox' | 'spec' | 'build' | 'review' | 'verify' | 'done'

export interface Task {
  key: string
  title: string
  desc: string
  size: Size
  col: Col
  usd: number
}
export type NewTask = Pick<Task, 'key' | 'title' | 'desc' | 'size'>

export interface Gate {
  id: string
  title: string
  what: string
  body: string
}

/** The one contract between a runtime (simulator now, Agent SDK later) and the UI. */
export type UEvent =
  | { t: 'agent.status'; agent: string; status: Status; activity?: string; task?: string }
  | { t: 'agent.usage'; agent: string; tin: number; tout: number; task?: string }
  | { t: 'agent.message'; id: number; from: string; to: string; kind: string }
  | { t: 'task.upsert'; task: Task }
  | { t: 'approval.needed'; gate: Gate }
  | { t: 'approval.resolved'; id: string }
  | { t: 'log'; agent?: string; text: string }
  | { t: 'arrow.expire'; id: number }

export type Bus = (e: UEvent) => void

export interface Runtime {
  submit(t: NewTask): void
  approve(id: string): void
  setSpeed(n: number): void
  setPaused(p: boolean): void
  setAuto(a: boolean): void
  stop(): void
}
