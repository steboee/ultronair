import type { BoardState, KitItem } from '../../shared/types'

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
      <Kit s={s} />
    </aside>
  )
}

/** What the agents can use: skills, subagents, commands and rules from the project and the kit/ plugin. */
function Kit({ s }: { s: BoardState }) {
  const groups: [string, KitItem[]][] = [['Skills', s.kit.skills], ['Agents', s.kit.agents], ['Commands', s.kit.commands], ['Rules', s.kit.rules]]
  return (
    <section className="mt-6 border-t border-line pt-3">
      <h2 className="mb-1 px-1 text-xs font-bold tracking-wider text-muted uppercase">Kit</h2>
      <p className="mb-2 px-1 text-[11px] text-muted">Every agent can use these. <b>project</b> = from {s.project.id}, <b>kit</b> = this repo's kit/ plugin.</p>
      {groups.map(([label, items]) => (
        <details key={label} className="px-1 py-0.5">
          <summary className="cursor-pointer text-sm font-semibold">{label} <span className="font-normal text-muted tabular-nums">{items.length}</span></summary>
          <ul className="mt-1 mb-2 space-y-0.5">
            {items.map((i) => (
              <li key={i.name} className="flex items-baseline gap-1.5 text-xs" title={i.description}>
                <span className="truncate font-mono">{i.name}</span>
                <span className={`ml-auto shrink-0 text-[10px] ${i.source === 'project' ? 'text-run' : 'text-muted'}`}>{i.source}</span>
              </li>
            ))}
            {!items.length && <li className="text-xs text-muted">{label === 'Rules' ? 'None found. Run npm run kit:import.' : 'None'}</li>}
          </ul>
        </details>
      ))}
    </section>
  )
}
