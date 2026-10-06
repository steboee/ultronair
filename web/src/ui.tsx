import type { ReactNode } from 'react'
import type { Task } from '../../shared/types'

export const ago = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`
}
export const usd = (n: number) => (n ? `$${n.toFixed(2)}` : '')

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
