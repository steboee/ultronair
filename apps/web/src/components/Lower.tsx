import { DESK, DEPT_VAR } from '../company'
import type { State } from '../state'
import type { Col } from '../types'

const COLS: Col[] = ['inbox', 'spec', 'build', 'review', 'verify', 'done']

export function Board({ s }: { s: State }) {
  return (
    <div className="board">
      {COLS.map((c) => {
        const ts = s.tasks.filter((t) => t.col === c)
        return (
          <div className="col" key={c}>
            <h4>{c}<span>{ts.length}</span></h4>
            {ts.map((t) => (
              <div className={`card${c !== 'done' ? ' run' : ''}`} key={t.key}>
                <span className="sz">{t.size}</span><b>{t.key}</b>
                <div>{t.title}</div>
                <div className="rl">${t.usd.toFixed(2)}</div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function Log({ s }: { s: State }) {
  return (
    <div className="log">
      {s.log.map((l) => {
        const sec = Math.floor((l.ts - s.t0) / 1000)
        const d = l.agent ? DESK[l.agent] : undefined
        return (
          <div key={l.n}>
            <time>{String(Math.floor(sec / 60)).padStart(2, '0')}:{String(sec % 60).padStart(2, '0')}</time>
            <em style={{ color: d ? `var(${DEPT_VAR[d.dept]})` : 'var(--ceo)' }}>{d ? d.name : 'CEO'}</em>
            <span>{l.text}</span>
          </div>
        )
      })}
    </div>
  )
}
