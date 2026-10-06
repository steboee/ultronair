import { load } from 'js-yaml'
import raw from '../../../config/company.yaml?raw'

interface RawAgent {
  id: string
  dept: string
  kind: 'code' | 'worker' | 'orchestrator'
  model?: string | { default: string; effort?: string }
  max_parallel?: number
  does?: string
}
interface RawConfig {
  models: Record<string, { id: string; usd_per_mtok: { in: number; out: number } }>
  budgets: { task_usd: Record<string, number>; daily_usd: number }
  project: { id: string }
  departments: Record<string, { name: string }>
  agents: RawAgent[]
}

const cfg = load(raw) as RawConfig

export const PROJECT = cfg.project.id
export const DAILY_USD = cfg.budgets.daily_usd
export const TASK_CAP = cfg.budgets.task_usd
export const MODELS = Object.fromEntries(
  Object.entries(cfg.models).map(([k, m]) => [k, { id: m.id, in: m.usd_per_mtok.in, out: m.usd_per_mtok.out }]),
)
export const MODEL_LABEL: Record<string, string> = { opus: 'Opus 5.5', sonnet: 'Sonnet 5.5', haiku: 'Haiku 4.5' }
export const DEPTS = Object.entries(cfg.departments).map(([id, d]) => ({ id, name: d.name }))
export const DEPT_VAR: Record<string, string> = {
  hq: '--hq', product: '--product', engineering: '--eng', qa: '--qa', release: '--release',
}

export interface Desk {
  id: string
  dept: string
  name: string
  role: string
  kind: RawAgent['kind']
  model?: string
  effort?: string
}

const UP = new Set(['mr', 'ci', 'qa', 'pm', 'db'])
const nice = (id: string) =>
  id.split('-').map((w) => (UP.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ')

export const DESKS: Desk[] = cfg.agents.flatMap((a) => {
  const model = typeof a.model === 'string' ? a.model : a.model?.default
  const effort = typeof a.model === 'object' ? a.model.effort : undefined
  const copies = a.max_parallel ?? 1
  return Array.from({ length: copies }, (_, i) => ({
    id: copies > 1 ? `${a.id}-${i + 1}` : a.id,
    dept: a.dept,
    name: nice(a.id) + (copies > 1 ? ` ${i + 1}` : ''),
    role: a.kind === 'code' ? 'HQ code' : a.kind,
    kind: a.kind,
    model,
    effort,
  }))
})
export const DESK = Object.fromEntries(DESKS.map((d) => [d.id, d])) as Record<string, Desk>
