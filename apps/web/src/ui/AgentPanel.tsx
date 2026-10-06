import { useOffice } from '../store/office'
import { describe } from '../store/office'
import { Avatar } from './Avatar'
import { AGENT_BG, AGENT_LABEL, TASK_BG, TASK_LABEL, ago, duration } from './status'

export function AgentPanel() {
  const id = useOffice((s) => s.selectedAgentId)
  const agent = useOffice((s) => (id ? s.agents[id] : undefined))
  const project = useOffice((s) => (agent ? s.projects[agent.projectId] : undefined))
  const tasks = useOffice((s) => s.tasks)
  const feed = useOffice((s) => s.feed)
  const select = useOffice((s) => s.select)
  if (!agent || !project) return null
  const task = agent.taskId ? tasks[agent.taskId] : undefined
  const timeline = feed.filter((e) => e.agentId === agent.id).slice(0, 40)

  return (
    <aside className="pop-in flex w-80 shrink-0 flex-col overflow-hidden border-l border-line bg-paper" aria-label={`${agent.name} details`}>
      <div className="flex items-center gap-3 border-b border-line p-4">
        <Avatar agent={agent} />
        <div className="min-w-0">
          <div className="text-lg font-black leading-tight">{agent.name}</div>
          <div className="text-sm font-semibold text-muted capitalize">{agent.role} · <span style={{ color: project.color }}>{project.name}</span></div>
        </div>
        <button onClick={() => select(undefined)} className="ml-auto rounded-lg px-2 py-1 text-muted hover:bg-sand" aria-label="Close">✕</button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${AGENT_BG[agent.status]}`}>{AGENT_LABEL[agent.status]}</span>
          {task ? (
            <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-line">
              <div className="font-extrabold">{task.title}</div>
              {task.description && <p className="mt-1 text-sm text-muted">{task.description}</p>}
              <div className="mt-3 flex items-center justify-between text-xs font-bold">
                <span className={`rounded-full px-2 py-0.5 text-white ${TASK_BG[task.status]}`}>{TASK_LABEL[task.status]}</span>
                <span className="tabular-nums">{Math.round(task.progress)}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sand">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${task.progress}%`, background: project.color }} />
              </div>
              {task.startedAt && <div className="mt-2 text-xs text-muted">Started {ago(task.startedAt)}</div>}
            </div>
          ) : <p className="mt-3 text-sm text-muted">No task right now. Give {agent.name} one with “New task”.</p>}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-black tracking-wider text-muted uppercase">Live timeline</h3>
          <ol className="space-y-1.5 border-l-2 border-line pl-3">
            {timeline.map((e) => (
              <li key={`${e.timestamp}-${e.type}-${e.taskId}`} className="slide-in text-sm">
                <span className="text-xs text-muted tabular-nums">{ago(e.timestamp)}</span> {describe(e).replace(`${agent.name} `, '')}
              </li>
            ))}
            {!timeline.length && <li className="text-sm text-muted">Nothing yet.</li>}
          </ol>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-black tracking-wider text-muted uppercase">Past tasks</h3>
          <ul className="space-y-1.5">
            {agent.pastTaskIds.map((tid) => tasks[tid]).filter(Boolean).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TASK_BG[t.status]}`} title={TASK_LABEL[t.status]} />
                <span className="truncate">{t.title}</span>
                {t.startedAt && t.finishedAt && <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">{duration(t.finishedAt - t.startedAt)}</span>}
              </li>
            ))}
            {!agent.pastTaskIds.length && <li className="text-sm text-muted">None finished yet.</li>}
          </ul>
        </section>
      </div>
    </aside>
  )
}
