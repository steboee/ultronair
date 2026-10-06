import { useState } from 'react'
import type { Kind, Size } from '../../shared/types'
import { api } from './api'
import { Button } from './ui'

type Choice = 'auto' | Kind
const KINDS: [Choice, string, string][] = [
  ['auto', 'Let HQ decide', 'Triage reads it and picks: an answer, or a change of the right size.'],
  ['question', 'Question', 'An Analyst reads the code and answers. Nothing is changed.'],
  ['change', 'Change', 'Code work. Pick the size below.'],
]
const SIZES: [Size, string][] = [
  ['S', 'implement → verify → review → MR'],
  ['M', 'spec + your approval → plan → build → verify → review → MR + your approval'],
  ['L', 'like M, with the bigger models and more effort'],
]

export function NewTask({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<Choice>('auto')
  const [size, setSize] = useState<Size>('M')
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const field = 'mt-1 w-full rounded-lg bg-paper px-3 py-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-ink'
  const option = (on: boolean) => `flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm ring-1 ${on ? 'bg-ground ring-ink' : 'ring-line'}`
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-label="New task" className="max-h-full w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-paper p-5 shadow-xl"
        onSubmit={async (e) => {
          e.preventDefault(); setBusy(true)
          try {
            const r = await api.create({ title, description, key: key || undefined, kind: kind === 'auto' ? undefined : kind, size: kind === 'change' ? size : undefined })
            onCreated((await r.json()).key); onClose()
          } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
        }}>
        <h2 className="text-lg font-bold">Ask or assign</h2>
        <label className="block text-sm font-semibold" htmlFor="nt-title">Title
          <input id="nt-title" autoFocus required className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What steps are currently in activation onboarding?" />
        </label>
        <label className="block text-sm font-semibold" htmlFor="nt-desc">Details <span className="font-normal text-muted">(optional)</span>
          <textarea id="nt-desc" rows={4} className={field} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Context, acceptance criteria, links. The more you say, the less the team guesses." />
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">What is it?</legend>
          <div className="mt-1 space-y-1">
            {KINDS.map(([k, label, d]) => (
              <label key={k} className={option(kind === k)}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-1" />
                <span><b>{label}</b> <span className="text-muted">{d}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        {kind === 'change' && (
          <fieldset>
            <legend className="text-sm font-semibold">Size</legend>
            <div className="mt-1 space-y-1">
              {SIZES.map(([s, d]) => (
                <label key={s} className={option(size === s)}>
                  <input type="radio" name="size" value={s} checked={size === s} onChange={() => setSize(s)} className="mt-1" />
                  <span><b className="font-mono">{s}</b> <span className="text-muted">{d}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="block text-sm font-semibold" htmlFor="nt-key">Jira key <span className="font-normal text-muted">(optional, used for the branch name)</span>
          <input id="nt-key" className={field} value={key} onChange={(e) => setKey(e.target.value)} placeholder="PM-3598" />
        </label>
        {error && <p className="text-sm font-semibold text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button kind="primary" disabled={busy}>Hand to HQ</Button>
        </div>
      </form>
    </div>
  )
}
