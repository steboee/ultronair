import { useMemo } from 'react'
import { useOffice } from '../store/office'
import { TASK_STATUSES } from '../model/types'
import { TASK_BG, TASK_LABEL } from './status'

export function Sidebar() {
  const projects = useOffice((s) => s.projects)
  const tasks = useOffice((s) => s.tasks)
  const agents = useOffice((s) => s.agents)
  const filter = useOffice((s) => s.filterProjectId)
  const setFilter = useOffice((s) => s.setFilter)

  const counts = useMemo(() => {
    const c: Record<string, Record<string, number>> = {}
    for (const t of Object.values(tasks)) (c[t.projectId] ??= {})[t.status] = (c[t.projectId][t.status] ?? 0) + 1
    return c
  }, [tasks])

  return (
    <nav className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-paper p-3" aria-label="Rooms">
      <button onClick={() => setFilter(undefined)} className={`rounded-xl px-3 py-2 text-left font-bold ${!filter ? 'bg-sand' : 'hover:bg-sand/60'}`}>
        All rooms <span className="font-semibold text-muted">· {Object.keys(agents).length} agents</span>
      </button>
      {Object.values(projects).map((p) => {
        const c = counts[p.id] ?? {}
        const n = Object.values(agents).filter((a) => a.projectId === p.id).length
        return (
          <button key={p.id} onClick={() => setFilter(filter === p.id ? undefined : p.id)}
            className={`rounded-xl px-3 py-2 text-left transition-colors ${filter === p.id ? 'bg-sand ring-2' : 'hover:bg-sand/60'}`}
            style={filter === p.id ? { ['--tw-ring-color' as string]: p.color } : undefined}>
            <div className="flex items-center gap-2 font-bold">
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-xs font-semibold text-muted">{n}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {TASK_STATUSES.filter((st) => c[st]).map((st) => (
                <span key={st} title={TASK_LABEL[st]} className={`rounded-full px-1.5 text-[11px] font-bold text-white ${TASK_BG[st]}`}>
                  {c[st]} {TASK_LABEL[st].toLowerCase()}
                </span>
              ))}
              {!Object.keys(c).length && <span className="text-xs text-muted">no tasks yet</span>}
            </div>
          </button>
        )
      })}
    </nav>
  )
}
