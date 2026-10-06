import type { NewTaskInput, OfficeEvent } from '../model/types'
import { MockSource } from './mock'
import { SseSource, WebSocketSource } from './remote'

/**
 * Anything that produces OfficeEvents. The scene and panels never talk to a source
 * directly: events go into the store, and the store is the single source of truth.
 */
export interface EventSource {
  connect(emit: (e: OfficeEvent) => void, status: (connected: boolean) => void): () => void
  /** "New task" from the UI. A real backend decides who gets it and answers with task_assigned. */
  createTask(input: NewTaskInput): Promise<void> | void
  /** optional knobs only the mock understands */
  setSpeed?(n: number): void
}

/**
 * VITE_EVENTS_URL unset  → built-in mock company
 * ws:// or wss://        → WebSocket (create_task is sent back on the same socket)
 * http:// or https://    → Server-Sent Events (create_task is POSTed to VITE_TASKS_URL)
 */
export function createSource(): EventSource {
  const url = import.meta.env.VITE_EVENTS_URL as string | undefined
  if (!url) return new MockSource()
  if (/^wss?:/.test(url)) return new WebSocketSource(url)
  return new SseSource(url, (import.meta.env.VITE_TASKS_URL as string | undefined) ?? url.replace(/\/events\/?$/, '/tasks'))
}
