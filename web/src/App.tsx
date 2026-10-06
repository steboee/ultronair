import { useState } from 'react'
import { useBoard } from './api'
import { Board } from './Board'
import { NewTask } from './NewTask'
import { TaskPanel } from './TaskPanel'
import { Team } from './Team'
import { Button } from './ui'
import { Meter } from './Meter'

export default function App() {
  const { state: s, online } = useBoard()
  const [selected, setSelected] = useState<string>()
  const [modal, setModal] = useState(false)
  if (!s) return <div className="grid h-full place-items-center text-muted">{online ? 'Loading…' : 'Connecting to HQ…'}</div>
  const waiting = s.tasks.filter((t) => t.status === 'waiting').length
  const working = s.agents.filter((a) => a.status === 'working').length

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-paper px-4">
        <h1 className="text-lg font-bold tracking-tight">Ultronair <span className="font-medium text-muted">HQ</span></h1>
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <span className={`h-2 w-2 rounded-full ${online ? 'bg-ok' : 'bg-bad'}`} />
          {s.project.id}
          <span className="hidden font-mono text-xs md:inline">{s.project.path}</span>
        </span>
        {!s.project.exists && <span className="rounded bg-bad/10 px-2 py-0.5 text-xs font-semibold text-bad">Project repo not found: set PROJECT_PATH</span>}
        {s.runtime === 'mock' && <span className="rounded bg-wait/15 px-2 py-0.5 text-xs font-semibold text-wait">Mock mode: no Claude calls</span>}
        <span className="text-sm text-muted tabular-nums">{working} working</span>
        <Meter u={s.usage} />
        {waiting > 0 && <span className="rounded-full bg-ceo px-2 py-0.5 text-xs font-bold text-white">{waiting} need{waiting === 1 ? 's' : ''} you</span>}
        <Button kind="primary" className="ml-auto" onClick={() => setModal(true)}>New task</Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <Team s={s} />
        <main className="min-w-0 flex-1">
          {s.tasks.length ? <Board s={s} selected={selected} onSelect={setSelected} /> : (
            <div className="grid h-full place-items-center">
              <div className="max-w-sm text-center">
                <p className="text-lg font-bold">The office is quiet.</p>
                <p className="mt-1 text-sm text-muted">Ask a question about the code or give the company a change to make. Questions get an answer from an Analyst; changes move across the board and stop for your approval on the spec and the merge request.</p>
                <Button kind="primary" className="mt-4" onClick={() => setModal(true)}>New task</Button>
              </div>
            </div>
          )}
        </main>
        {selected && <TaskPanel s={s} taskKey={selected} onClose={() => setSelected(undefined)} />}
      </div>
      {modal && <NewTask onClose={() => setModal(false)} onCreated={setSelected} />}
    </div>
  )
}
