import { useState } from 'react'
import { useOffice } from '../store/office'
import type { NewTaskInput } from '../model/types'

export function NewTaskModal({ onClose, onCreate }: { onClose: () => void; onCreate: (t: NewTaskInput) => Promise<void> | void }) {
  const projects = Object.values(useOffice((s) => s.projects))
  const agents = useOffice((s) => s.agents)
  const filter = useOffice((s) => s.filterProjectId)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(filter ?? projects[0]?.id ?? '')
  const [agentId, setAgentId] = useState('')
  const [error, setError] = useState('')
  const inRoom = Object.values(agents).filter((a) => a.projectId === projectId)
  const field = 'mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-in_progress'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form role="dialog" aria-label="New task" className="pop-in w-full max-w-md space-y-3 rounded-2xl bg-paper p-5 shadow-xl"
        onSubmit={async (e) => {
          e.preventDefault()
          try { await onCreate({ title, description, projectId, agentId: agentId || undefined }); onClose() }
          catch (err) { setError(err instanceof Error ? err.message : 'Could not create the task.') }
        }}>
        <h2 className="text-xl font-black">New task</h2>
        <label className="block text-sm font-bold">Title
          <input id="nt-title" autoFocus required className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix login redirect" />
        </label>
        <label className="block text-sm font-bold">Description
          <textarea id="nt-desc" rows={3} className={field} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">Room
            <select id="nt-project" className={field} value={projectId} onChange={(e) => { setProjectId(e.target.value); setAgentId('') }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-bold">Agent
            <select id="nt-agent" className={field} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Auto-assign</option>
              {inRoom.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role}{a.status !== 'idle' ? ', busy' : ''})</option>)}
            </select>
          </label>
        </div>
        {error && <p className="text-sm font-bold text-blocked">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 font-bold hover:bg-sand">Cancel</button>
          <button className="rounded-xl bg-ink px-4 py-2 font-bold text-white hover:bg-ink/90">Assign task</button>
        </div>
      </form>
    </div>
  )
}
