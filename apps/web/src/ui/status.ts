import type { AgentStatus, TaskStatus } from '../model/types'

export const TASK_LABEL: Record<TaskStatus, string> = {
  queued: 'Queued', in_progress: 'In progress', blocked: 'Blocked', review: 'In review', done: 'Done', failed: 'Failed',
}
export const TASK_BG: Record<TaskStatus, string> = {
  queued: 'bg-queued', in_progress: 'bg-in_progress', blocked: 'bg-blocked', review: 'bg-review', done: 'bg-done', failed: 'bg-failed',
}
export const AGENT_LABEL: Record<AgentStatus, string> = { idle: 'Idle', working: 'Working', blocked: 'Blocked', review: 'In review' }
export const AGENT_BG: Record<AgentStatus, string> = { idle: 'bg-queued', working: 'bg-in_progress', blocked: 'bg-blocked', review: 'bg-review' }

export function ago(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
export function duration(ms: number) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
