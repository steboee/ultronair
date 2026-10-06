import { useEffect, useState } from 'react'
import { COLUMN_LABEL, type BoardState } from '../../shared/types'
import { api } from './api'
import { Button, StatusPill, ago, usd } from './ui'

export function TaskPanel({ s, taskKey, onClose }: { s: BoardState; taskKey: string; onClose: () => void }) {
  const t = s.tasks.find((x) => x.key === taskKey)
  const [tab, setTab] = useState<string>('')
  const [content, setContent] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  // show the document under approval first, otherwise the newest handoff file
  const fileTab = tab || t?.waiting?.file || t?.files[t.files.length - 1] || ''
  const fileStamp = t ? `${t.files.length}:${t.updatedAt}` : ''
  useEffect(() => {
    if (!t || !fileTab || fileTab === 'log') return
    api.file(t.key, fileTab).then(setContent, () => setContent(''))
  }, [t?.key, fileTab, fileStamp]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTab(''); setFeedback(''); setError('') }, [taskKey])
  if (!t) return null

  const act = (f: () => Promise<unknown>) => f().then(() => setError(''), (e: Error) => setError(e.message))
  const name = (id?: string) => s.agents.find((a) => a.id === id)?.name ?? (id === 'router' ? 'HQ' : id ? id : 'CEO')

  return (
    <aside className="flex w-[30rem] shrink-0 flex-col border-l border-line bg-paper" aria-label={`Task ${t.key}`}>
      <header className="border-b border-line p-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">{t.key}</span>
          <span className="rounded bg-ground px-1 font-mono text-[10px] text-muted">{t.size}</span>
          <StatusPill status={t.status} />
          <span className="text-xs text-muted">{COLUMN_LABEL[t.column]}</span>
          <button onClick={onClose} className="ml-auto rounded px-2 text-muted hover:bg-ground" aria-label="Close">✕</button>
        </div>
        <h2 className="mt-1 text-lg leading-snug font-bold">{t.title}</h2>
        {t.description && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{t.description}</p>}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
          {t.branch && <span>branch {t.branch}</span>}
          {t.fixRound > 0 && <span>fix rounds {t.fixRound}</span>}
          {t.costUsd > 0 && <span>cost {usd(t.costUsd)}</span>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {t.status === 'waiting' && t.waiting && (
          <section className="m-4 rounded-xl bg-ceo/10 p-3 ring-1 ring-ceo/40">
            <div className="text-sm font-bold">{t.waiting.gate === 'approve-spec' ? 'Approve the spec?' : 'Approve the merge request?'}</div>
            <p className="mt-0.5 text-xs text-muted">Read it below. Approving lets the company continue; requesting changes sends it back to {t.waiting.gate === 'approve-spec' ? 'the PM Lead' : 'the MR Writer'}.</p>
            <div className="mt-2 flex gap-2">
              <Button kind="primary" onClick={() => act(() => api.approve(t.key))}>Approve</Button>
            </div>
            <label className="mt-3 block text-xs font-semibold" htmlFor="fb">Or request changes</label>
            <textarea id="fb" rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What should change?"
              className="mt-1 w-full rounded-lg bg-paper p-2 text-sm ring-1 ring-line outline-none focus:ring-ink" />
            <Button className="mt-1" disabled={!feedback.trim()} onClick={() => act(() => api.changes(t.key, feedback).then(() => setFeedback('')))}>Send back</Button>
          </section>
        )}
        {t.status === 'failed' && (
          <section className="m-4 rounded-xl bg-bad/8 p-3 ring-1 ring-bad/30">
            <div className="text-sm font-bold text-bad">Stopped</div>
            <p className="mt-0.5 text-sm">{t.error}</p>
            <Button className="mt-2" kind="primary" onClick={() => act(() => api.retry(t.key))}>Retry from this step</Button>
          </section>
        )}
        {error && <p className="mx-4 mt-2 text-sm font-semibold text-bad">{error}</p>}

        <section className="px-4 pt-3">
          <h3 className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Steps</h3>
          <ol className="space-y-1">
            {t.steps.map((st, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${st.status === 'running' ? 'pulse bg-run' : st.status === 'done' ? 'bg-ok' : 'bg-bad'}`} />
                <span className="font-semibold">{st.agentName ?? 'HQ'}</span>
                <span className="text-muted">{st.name}</span>
                {st.note && <span className="truncate text-xs text-muted">· {st.note}</span>}
                <span className="ml-auto font-mono text-[11px] text-muted">{st.endedAt ? `${Math.round((st.endedAt - st.startedAt) / 1000)}s` : 'now'}{st.costUsd ? ` · ${usd(st.costUsd)}` : ''}</span>
              </li>
            ))}
            {!t.steps.length && <li className="text-sm text-muted">Not started yet.</li>}
          </ol>
        </section>

        <section className="px-4 pt-4 pb-4">
          <div className="mb-2 flex flex-wrap gap-1" role="tablist">
            {[...t.files, 'log'].map((f) => (
              <button key={f} role="tab" aria-selected={fileTab === f} onClick={() => setTab(f)}
                className={`rounded-md px-2 py-1 font-mono text-xs ${fileTab === f ? 'bg-ink text-white' : 'bg-ground text-muted hover:text-ink'}`}>{f}</button>
            ))}
          </div>
          {fileTab === 'log' || !fileTab ? (
            <ol className="space-y-0.5 font-mono text-[11.5px]">
              {[...t.log].reverse().slice(0, 150).map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 text-muted">{ago(l.ts)}</span>
                  <span className="shrink-0 font-semibold">{name(l.agent)}</span>
                  <span className="min-w-0 break-words">{l.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <pre className="overflow-x-auto rounded-lg bg-ground p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">{content || 'Loading…'}</pre>
          )}
        </section>
      </div>

      <footer className="flex gap-2 border-t border-line p-3">
        {(t.status === 'running' || t.status === 'waiting' || t.status === 'queued') && <Button kind="danger" onClick={() => act(() => api.cancel(t.key))}>Cancel task</Button>}
        {(t.status === 'failed' || t.status === 'done') && (
          <Button kind="danger" onClick={() => act(() => api.remove(t.key).then(onClose))}>Remove{t.worktree ? ' + worktree' : ''}</Button>
        )}
      </footer>
    </aside>
  )
}
