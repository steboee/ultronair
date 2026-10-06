import { useEffect, useState } from 'react'
import type { BoardState, NewTask } from '../../shared/types'

/** Live board state from HQ over Server-Sent Events. */
export function useBoard() {
  const [state, setState] = useState<BoardState>()
  const [online, setOnline] = useState(false)
  useEffect(() => {
    const es = new EventSource('/api/events')
    es.onopen = () => setOnline(true)
    es.onerror = () => setOnline(false)
    es.onmessage = (m) => setState(JSON.parse(m.data))
    return () => es.close()
  }, [])
  return { state, online }
}

async function call(path: string, init?: RequestInit) {
  const r = await fetch(path, { headers: { 'content-type': 'application/json' }, ...init })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HQ answered ${r.status}`)
  return r
}
const post = (path: string, body?: unknown) => call(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
const k = encodeURIComponent

export const api = {
  create: (t: NewTask) => post('/api/tasks', t),
  approve: (key: string) => post(`/api/tasks/${k(key)}/approve`),
  changes: (key: string, feedback: string) => post(`/api/tasks/${k(key)}/changes`, { feedback }),
  retry: (key: string) => post(`/api/tasks/${k(key)}/retry`),
  cancel: (key: string) => post(`/api/tasks/${k(key)}/cancel`),
  remove: (key: string) => call(`/api/tasks/${k(key)}`, { method: 'DELETE' }),
  file: async (key: string, name: string) => (await call(`/api/tasks/${k(key)}/file/${k(name)}`)).text(),
}
