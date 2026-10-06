import type { NewTaskInput, OfficeEvent } from '../model/types'
import type { EventSource } from './source'

/** Accepts one event or an array of events per message. */
function parse(data: string): OfficeEvent[] {
  try {
    const v = JSON.parse(data)
    return (Array.isArray(v) ? v : [v]).filter((e) => e && typeof e.type === 'string')
  } catch {
    console.warn('[office] ignoring malformed event', data)
    return []
  }
}

export class WebSocketSource implements EventSource {
  private ws?: WebSocket
  private closed = false
  private retry = 500
  constructor(private url: string) {}

  connect(emit: (e: OfficeEvent) => void, status: (c: boolean) => void) {
    const open = () => {
      if (this.closed) return
      const ws = new WebSocket(this.url)
      this.ws = ws
      ws.onopen = () => { this.retry = 500; status(true) }
      ws.onmessage = (m) => parse(String(m.data)).forEach(emit)
      ws.onclose = () => {
        status(false)
        if (!this.closed) setTimeout(open, (this.retry = Math.min(this.retry * 2, 10_000)))
      }
    }
    open()
    return () => { this.closed = true; this.ws?.close() }
  }

  createTask(input: NewTaskInput) {
    this.ws?.send(JSON.stringify({ type: 'create_task', payload: input }))
  }
}

export class SseSource implements EventSource {
  private es?: globalThis.EventSource
  constructor(private url: string, private tasksUrl: string) {}

  connect(emit: (e: OfficeEvent) => void, status: (c: boolean) => void) {
    // the browser's EventSource reconnects on its own
    const es = new globalThis.EventSource(this.url)
    this.es = es
    es.onopen = () => status(true)
    es.onerror = () => status(false)
    es.onmessage = (m) => parse(m.data).forEach(emit)
    return () => es.close()
  }

  async createTask(input: NewTaskInput) {
    const r = await fetch(this.tasksUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
    if (!r.ok) throw new Error(`Creating the task failed (${r.status})`)
  }
}
