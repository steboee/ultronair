import { describe, useOffice } from '../store/office'

export function Ticker() {
  const feed = useOffice((s) => s.feed)
  const agents = useOffice((s) => s.agents)
  const projects = useOffice((s) => s.projects)
  const filter = useOffice((s) => s.filterProjectId)
  const items = feed.filter((e) => e.type !== 'progress' && (!filter || agents[e.agentId]?.projectId === filter)).slice(0, 12)
  return (
    <footer className="flex h-11 shrink-0 items-center gap-3 overflow-hidden border-t border-line bg-paper px-4" aria-live="polite">
      <span className="shrink-0 text-xs font-black tracking-wider text-muted uppercase">Live</span>
      <div className="flex min-w-0 gap-5 overflow-hidden whitespace-nowrap">
        {items.map((e) => {
          const p = projects[agents[e.agentId]?.projectId ?? '']
          return (
            <span key={`${e.timestamp}-${e.type}-${e.agentId}-${e.taskId}`} className="slide-in flex items-center gap-1.5 text-sm">
              <span className="h-2 w-2 rounded-full" style={{ background: p?.color ?? '#94a3b8' }} />
              {describe(e)}
            </span>
          )
        })}
      </div>
    </footer>
  )
}
