import type { Usage } from '../../shared/types'
import { clock, day } from './ui'

function Gauge({ label, pct, resets }: { label: string; pct: number; resets: string }) {
  const color = pct >= 90 ? 'bg-bad' : pct >= 70 ? 'bg-wait' : 'bg-ok'
  return (
    <div className="flex items-center gap-2" title={`${label}: ${pct}% used, resets ${resets}`}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ground ring-1 ring-line">
        <span className={`block h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="text-xs font-semibold tabular-nums">{pct}%</span>
      <span className="hidden text-[11px] text-muted lg:inline">resets {resets}</span>
    </div>
  )
}

/** Your Claude plan limits as Claude Code last reported them (updated at the start of every agent run). */
export function Meter({ u }: { u: Usage }) {
  if (!u.fiveHour && !u.sevenDay) return <span className="text-xs text-muted">Session usage shows after the first agent runs</span>
  return (
    <div className="flex items-center gap-4">
      {u.fiveHour && <Gauge label="Session" pct={u.fiveHour.pct} resets={clock(u.fiveHour.resetsAt)} />}
      {u.sevenDay && <Gauge label="Week" pct={u.sevenDay.pct} resets={day(u.sevenDay.resetsAt)} />}
    </div>
  )
}
