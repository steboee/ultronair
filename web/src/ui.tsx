import type { ReactNode } from 'react'
import { tokenTotal, type Task, type Tokens } from '../../shared/types'

export const ago = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`
}
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
/** "58k tokens" */
export const tok = (t?: Tokens) => (tokenTotal(t) ? `${k(tokenTotal(t))} tokens` : '')
/** "1k new · 56k cached · 0.3k out" */
export const tokDetail = (t?: Tokens) =>
  t && tokenTotal(t) ? `${k(t.input + t.cacheWrite)} new · ${k(t.cacheRead)} cached · ${k(t.output)} out` : ''
export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
export const day = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'short' }) + ' ' + clock(ms)

const STATUS: Record<Task['status'], [string, string]> = {
  queued: ['Queued', 'bg-muted'], running: ['Working', 'bg-run'], waiting: ['Needs you', 'bg-wait'], done: ['Done', 'bg-ok'], failed: ['Stopped', 'bg-bad'],
}
export function StatusPill({ status }: { status: Task['status'] }) {
  const [label, bg] = STATUS[status]
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${bg}`}>{label}</span>
}

export function Button({ children, kind = 'plain', ...p }: { children: ReactNode; kind?: 'plain' | 'primary' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = {
    plain: 'bg-paper ring-1 ring-line hover:ring-muted',
    primary: 'bg-ink text-white hover:bg-ink/85',
    danger: 'bg-paper text-bad ring-1 ring-line hover:ring-bad',
  }[kind]
  return <button {...p} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ceo ${cls} ${p.className ?? ''}`}>{children}</button>
}
