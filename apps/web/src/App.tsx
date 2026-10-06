import { useEffect, useReducer, useRef, useState } from 'react'
import { PROJECT } from './company'
import { init, reduce } from './state'
import { SimRuntime } from './sim'
import type { Runtime } from './types'
import { Office } from './components/Office'
import { Detail, Gates, NewTaskForm, Spend } from './components/Panels'
import { Board, Log } from './components/Lower'

export default function App() {
  const [s, dispatch] = useReducer(reduce, undefined, init)
  const rt = useRef<Runtime | null>(null)
  const speed = useRef(2)
  const [spd, setSpd] = useState(2)
  const [paused, setPaused] = useState(false)
  const [auto, setAuto] = useState(false)
  const [sel, setSel] = useState('ceo')

  useEffect(() => {
    const r = new SimRuntime((e) => {
      dispatch(e)
      if (e.t === 'agent.message') setTimeout(() => dispatch({ t: 'arrow.expire', id: e.id }), 1800 / speed.current)
    })
    rt.current = r
    dispatch({ t: 'log', text: 'office open. Hand a task to HQ to watch the company work.' })
    r.submit({ key: 'PM-3598', title: 'Add resume-later link to onboarding step 3', desc: '', size: 'M' })
    return () => r.stop()
  }, [])

  return (
    <div className="wrap">
      <header>
        <h1>Ultronair<small>Wezeo AI dev company · project {PROJECT}</small></h1>
        <div className="ctl">
          <label htmlFor="speed" style={{ margin: 0 }}>Speed</label>
          <select id="speed" style={{ width: 'auto' }} value={spd} onChange={(e) => { const v = +e.target.value; setSpd(v); speed.current = v; rt.current?.setSpeed(v) }}>
            {[1, 2, 4, 8].map((v) => <option key={v} value={v}>{v}×</option>)}
          </select>
          <label className="inline"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); rt.current?.setAuto(e.target.checked) }} /> auto-approve gates</label>
          <button className="btn" onClick={() => { rt.current?.setPaused(!paused); setPaused(!paused) }}>{paused ? 'Resume' : 'Pause'}</button>
        </div>
      </header>
      <div className="banner">Simulated agents. The office, models, roles and prices are read from config/company.yaml; activity and token counts are scripted until the real runtime is connected.</div>

      <div className="main">
        <section>
          <Office agents={s.agents} arrows={s.arrows} pending={s.gates.length} selected={sel} onSelect={setSel} />
          <div className="legend">
            {[['idle', '--line'], ['thinking', '--think'], ['tool', '--tool'], ['waiting', '--warn'], ['blocked', '--bad'], ['done', '--ok']].map(([k, v]) => (
              <span key={k} style={{ ['--c' as string]: `var(${v})` }}><i />{k}</span>
            ))}
            <span>robot desk = HQ code, 0 tokens</span>
          </div>
        </section>
        <aside className="side">
          <div className="panel"><h2>Inspector <span>click a desk</span></h2><Detail id={sel} s={s} /></div>
          <div className="panel">
            <h2>CEO desk <span>you</span></h2>
            <Gates gates={s.gates} onApprove={(id) => rt.current?.approve(id)} />
            <NewTaskForm onSubmit={(t) => rt.current?.submit(t)} />
          </div>
          <div className="panel"><h2>Spend <span>list price</span></h2><Spend s={s} /></div>
        </aside>
      </div>

      <div className="lower">
        <div className="panel"><h2>Task board</h2><Board s={s} /></div>
        <div className="panel"><h2>Event log <span>newest first</span></h2><Log s={s} /></div>
      </div>
    </div>
  )
}
