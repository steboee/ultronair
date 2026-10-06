import type { BoardState } from '../../shared/types'

export function Team({ s }: { s: BoardState }) {
  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-line bg-paper p-3" aria-label="Team">
      <h2 className="mb-2 px-1 text-xs font-bold tracking-wider text-muted uppercase">Team</h2>
      <div className="space-y-4">
        {s.departments.map((d) => (
          <section key={d.id}>
            <h3 className="mb-1 flex items-center gap-2 px-1 text-sm font-bold">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />{d.name}
            </h3>
            <ul className="space-y-0.5">
              {s.agents.filter((a) => a.dept === d.id).map((a) => (
                <li key={a.id} className={`rounded-lg px-2 py-1.5 ${a.status === 'working' ? 'bg-ground' : ''}`}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${a.status === 'working' ? 'pulse bg-run' : a.kind === 'code' ? 'bg-line' : 'bg-ok/40'}`} />
                    <span className="font-semibold">{a.name}</span>
                    <span className="truncate text-muted">{a.role}</span>
                    {a.kind === 'code' ? <span className="ml-auto text-[10px] text-muted">code</span> : a.model && <span className="ml-auto font-mono text-[10px] text-muted">{a.model}</span>}
                  </div>
                  {a.status === 'working' && (
                    <div className="mt-0.5 truncate pl-4 font-mono text-[11px] text-run">{a.taskKey} · {a.activity}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}
