import { useEffect, useMemo, useState } from 'react'
import { createSource } from './events/source'
import { useOffice } from './store/office'
import { OfficeCanvas } from './ui/OfficeCanvas'
import { Sidebar } from './ui/Sidebar'
import { AgentPanel } from './ui/AgentPanel'
import { Ticker } from './ui/Ticker'
import { NewTaskModal } from './ui/NewTaskModal'

export default function App() {
  const source = useMemo(() => createSource(), [])
  const [modal, setModal] = useState(false)
  const connected = useOffice((s) => s.connected)
  const working = useOffice((s) => Object.values(s.agents).filter((a) => a.status !== 'idle').length)
  const total = useOffice((s) => Object.keys(s.agents).length)
  const focusRoom = useOffice((s) => s.focusRoom)

  useEffect(() => {
    const { apply, setConnected } = useOffice.getState()
    return source.connect(apply, setConnected)
  }, [source])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-paper px-4">
        <h1 className="text-xl font-black tracking-tight">Ultronair <span className="font-bold text-muted">Office</span></h1>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-muted">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-done' : 'bg-blocked'}`} />
          {import.meta.env.VITE_EVENTS_URL ? (connected ? 'Live' : 'Reconnecting…') : 'Mock data'}
        </span>
        <span className="text-sm font-semibold text-muted tabular-nums">{working} of {total} agents busy</span>
        {source.setSpeed && (
          <label className="flex items-center gap-1.5 text-sm font-semibold text-muted">Speed
            <select id="speed" className="rounded-lg border border-line bg-white px-1.5 py-0.5" defaultValue="1" onChange={(e) => source.setSpeed?.(+e.target.value)}>
              {[0.5, 1, 2, 4].map((v) => <option key={v} value={v}>{v}×</option>)}
            </select>
          </label>
        )}
        <button onClick={() => focusRoom(undefined)} className="ml-auto rounded-xl px-3 py-1.5 text-sm font-bold hover:bg-sand">Fit view</button>
        <button onClick={() => setModal(true)} className="rounded-xl bg-ink px-4 py-1.5 text-sm font-bold text-white hover:bg-ink/90">New task</button>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1"><OfficeCanvas /></main>
        <AgentPanel />
      </div>
      <Ticker />
      {modal && <NewTaskModal onClose={() => setModal(false)} onCreate={(t) => source.createTask(t)} />}
    </div>
  )
}
