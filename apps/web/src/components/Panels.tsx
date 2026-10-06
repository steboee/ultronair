import { useState } from 'react'
import { DAILY_USD, DEPTS, DEPT_VAR, DESK, MODELS, MODEL_LABEL, TASK_CAP } from '../company'
import type { State } from '../state'
import type { Gate, NewTask, Size } from '../types'
import { CEO } from '../layout'

const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n))

export function Gates({ gates, onApprove }: { gates: Gate[]; onApprove: (id: string) => void }) {
  if (!gates.length) return <div className="empty">No approvals waiting.</div>
  return (
    <>
      {gates.map((g) => (
        <div className="gate" key={g.id}>
          <b>{g.title}</b>
          <p>Waiting on you: {g.what}</p>
          <pre>{g.body}</pre>
          <button className="btn primary" onClick={() => onApprove(g.id)}>Approve</button>
        </div>
      ))}
    </>
  )
}

export function NewTaskForm({ onSubmit }: { onSubmit: (t: NewTask) => void }) {
  const [title, setTitle] = useState('Add resume-later link to onboarding step 3')
  const [desc, setDesc] = useState('Users who stop in the questionnaire get a resume link by SMS. Reuse the existing SMS template service.')
  const [key, setKey] = useState('PM-3599')
  const [size, setSize] = useState<Size>('M')
  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      onSubmit({ key, title, desc, size })
      const m = key.match(/^(.*?)(\d+)$/)
      if (m) setKey(m[1] + (+m[2] + 1))
    }}>
      <label htmlFor="t-title">New task</label>
      <input id="t-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="t-desc">Description</label>
      <textarea id="t-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="row">
        <div><label htmlFor="t-key">Jira key</label><input id="t-key" value={key} onChange={(e) => setKey(e.target.value)} /></div>
        <div>
          <label htmlFor="t-size">Size</label>
          <select id="t-size" value={size} onChange={(e) => setSize(e.target.value as Size)}>
            <option value="S">S (small)</option><option value="M">M (medium)</option><option value="L">L (large)</option>
          </select>
        </div>
      </div>
      <button className="btn primary wide">Hand to HQ</button>
    </form>
  )
}

export function Spend({ s }: { s: State }) {
  const run = s.tasks.find((t) => t.col !== 'done' && t.col !== 'queued')
  return (
    <>
      <div className="big">${s.spent.toFixed(2)}<small>of ${DAILY_USD} daily</small></div>
      <div className="bar"><i style={{ width: Math.min(100, (s.spent / DAILY_USD) * 100) + '%' }} /></div>
      {DEPTS.filter((d) => s.byDept[d.id]).map((d) => (
        <Row key={d.id} label={d.name} color={`var(${DEPT_VAR[d.id]})`} v={s.byDept[d.id]} total={s.spent} />
      ))}
      {Object.entries(s.byModel).map(([m, v]) => <Row key={m} label={MODEL_LABEL[m].split(' ')[0]} v={v} total={s.spent} />)}
      <div className="rl tok">
        tokens {fmt(s.tin)} in / {fmt(s.tout)} out
        {run ? ` · ${run.key} $${run.usd.toFixed(2)} of $${TASK_CAP[run.size]}` : ''}
      </div>
    </>
  )
}
const Row = ({ label, v, total, color }: { label: string; v: number; total: number; color?: string }) => (
  <div className="srow">
    <span style={{ color }}>{label}</span>
    <div className="bar" style={{ ['--c' as string]: color }}><i style={{ width: Math.min(100, (v / Math.max(total, 0.01)) * 100) + '%' }} /></div>
    <span>${v.toFixed(2)}</span>
  </div>
)

export function Detail({ id, s }: { id: string; s: State }) {
  if (id === CEO) return <div className="rl">You decide what gets built. Approvals appear on this panel.</div>
  const d = DESK[id]
  const a = s.agents[id]
  if (!d) return <div className="empty">Click a desk to inspect an agent.</div>
  return (
    <div className="detail">
      <div className="dn" style={{ color: `var(${DEPT_VAR[d.dept]})` }}>{d.name}</div>
      <div className="rl">{d.role} · {DEPTS.find((x) => x.id === d.dept)?.name}</div>
      <dl>
        <dt>Model</dt><dd>{d.model ? `${MODEL_LABEL[d.model]}${d.effort ? ' · ' + d.effort : ''} ($${MODELS[d.model].in}/$${MODELS[d.model].out} per Mtok)` : 'none, HQ code'}</dd>
        <dt>Status</dt><dd>{a.status}</dd>
        <dt>Doing</dt><dd>{a.activity}</dd>
        <dt>Task</dt><dd>{a.task || '–'}</dd>
        <dt>Tokens</dt><dd>{fmt(a.tin)} in / {fmt(a.tout)} out</dd>
        <dt>Spent</dt><dd>${a.usd.toFixed(2)}</dd>
      </dl>
    </div>
  )
}
