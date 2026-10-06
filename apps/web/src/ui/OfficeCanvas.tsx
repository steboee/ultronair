import { useEffect, useRef } from 'react'
import { Application, useApplication } from '@pixi/react'
import { OfficeScene } from '../scene/OfficeScene'
import { useOffice } from '../store/office'
import { AGENT_LABEL } from './status'

/** Mounts the imperative Pixi scene once the app is ready. React never re-renders the scene. */
function SceneHost() {
  const { app, isInitialised } = useApplication()
  useEffect(() => {
    if (!isInitialised) return
    const scene = new OfficeScene(app)
    return () => scene.destroy()
  }, [app, isInitialised])
  return null
}

function Tooltip() {
  const hover = useOffice((s) => s.hover)
  const agent = useOffice((s) => (hover ? s.agents[hover.agentId] : undefined))
  const task = useOffice((s) => (agent?.taskId ? s.tasks[agent.taskId] : undefined))
  if (!hover || !agent) return null
  return (
    <div className="pointer-events-none absolute z-10 max-w-60 rounded-xl bg-white/95 px-3 py-2 text-sm shadow-lg ring-1 ring-line" style={{ left: hover.x + 14, top: hover.y + 14 }}>
      <div className="font-extrabold">{agent.name} <span className="font-semibold text-muted">· {agent.role}</span></div>
      <div className="text-muted">{AGENT_LABEL[agent.status]}</div>
      {task && <div className="mt-1 truncate font-semibold">{task.title}</div>}
    </div>
  )
}

export function OfficeCanvas() {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="sky relative h-full w-full overflow-hidden">
      <Application resizeTo={ref} backgroundAlpha={0} antialias autoDensity resolution={Math.min(2, window.devicePixelRatio || 1)}>
        <SceneHost />
      </Application>
      <Tooltip />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-muted">
        Drag to pan · scroll to zoom · click a room to focus
      </div>
    </div>
  )
}
