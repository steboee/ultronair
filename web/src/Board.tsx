import { COLUMNS, COLUMN_LABEL, type BoardState } from '../../shared/types'
import { StatusPill, tok } from './ui'

export function Board({ s, selected, onSelect }: { s: BoardState; selected?: string; onSelect: (k: string) => void }) {
  const agent = (id?: string) => s.agents.find((a) => a.id === id)
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {COLUMNS.map((c) => {
        const ts = s.tasks.filter((t) => t.column === c)
        const gate = c === 'approve_spec' || c === 'approve_mr'
        return (
          <section key={c} className={`flex w-52 shrink-0 flex-col rounded-xl ${gate ? 'bg-ceo/8 ring-1 ring-ceo/30' : 'bg-black/[.03]'}`}>
            <h2 className="flex items-center justify-between px-3 pt-3 pb-2 text-xs font-bold tracking-wider text-muted uppercase">
              {COLUMN_LABEL[c]} <span className="tabular-nums">{ts.length || ''}</span>
            </h2>
            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {ts.map((t) => {
                const a = agent(t.agentId)
                return (
                  <button key={t.key} onClick={() => onSelect(t.key)}
                    className={`block w-full rounded-lg bg-paper p-3 text-left shadow-sm ring-1 transition hover:ring-muted ${selected === t.key ? 'ring-2 ring-ink' : t.status === 'waiting' ? 'ring-ceo' : t.status === 'failed' ? 'ring-bad/60' : 'ring-line'}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-medium text-muted">{t.key}</span>
                      <span className="rounded bg-ground px-1 font-mono text-[10px] text-muted" title={t.kind === 'question' ? 'Question' : t.kind ? `${t.size} change` : 'Triage is deciding'}>
                        {t.kind === 'question' ? 'Q' : t.kind ? t.size : '?'}
                      </span>
                      <span className="ml-auto"><StatusPill status={t.status} /></span>
                    </div>
                    <div className="mt-1 text-sm leading-snug font-semibold">{t.title}</div>
                    {t.status === 'running' && (
                      <div className="mt-2 truncate font-mono text-[11px] text-run">
                        {a ? `${a.name}: ` : ''}{t.activity ?? 'starting…'}
                      </div>
                    )}
                    {t.status === 'waiting' && <div className="mt-2 text-xs font-semibold text-wait">Waiting for your approval</div>}
                    {t.status === 'failed' && <div className="mt-2 line-clamp-2 text-xs text-bad">{t.error}</div>}
                    {t.status === 'done' && t.kind === 'question' && <div className="mt-2 text-xs font-semibold text-ok">Answered</div>}
                    {tok(t.tokens) && <div className="mt-1 text-right font-mono text-[10px] text-muted">{tok(t.tokens)}</div>}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
