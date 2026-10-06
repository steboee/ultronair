import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import type { Dept, Size } from '../shared/types'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_DIR = path.join(ROOT, '.ultronair')

interface RawAgent {
  id: string
  name?: string
  names?: string[]
  dept: string
  kind: 'orchestrator' | 'worker' | 'code'
  model?: string | { default: string; effort?: string; L?: { model?: string; effort?: string } }
  max_parallel?: number
  tools?: string[]
  bash_allow?: string[]
}
interface RawConfig {
  models: Record<string, { id: string }>
  project: {
    id: string
    path: string
    base_branch: string
    branch_pattern: string
    protected_write_paths?: string[]
    secret_paths?: string[]
    verify: string[]
    known_baseline_failures?: string[]
  }
  routes: Record<Size, string[]> & { max_fix_rounds: number }
  departments: Record<string, { name: string; office?: { color: string } }>
  agents: RawAgent[]
}

const file = process.env.ULTRONAIR_CONFIG ?? path.join(ROOT, 'config/company.yaml')
const raw = parse(readFileSync(file, 'utf8')) as RawConfig

const expand = (p: string) => (p.startsWith('~') ? path.join(homedir(), p.slice(1)) : p)

export const PROJECT = {
  ...raw.project,
  path: path.resolve(expand(process.env.PROJECT_PATH ?? raw.project.path)),
  known_baseline_failures: raw.project.known_baseline_failures ?? [],
  protected_write_paths: raw.project.protected_write_paths ?? [],
  secret_paths: raw.project.secret_paths ?? [],
}
export const projectExists = () => existsSync(path.join(PROJECT.path, '.git'))
export const ROUTES = raw.routes
export const RUNTIME: 'claude' | 'mock' = process.env.ULTRONAIR_RUNTIME === 'mock' ? 'mock' : 'claude'

const PALETTE = ['#ff8a7a', '#6cb4ee', '#5cc9a7', '#b39ddb', '#f6c453', '#ef8fb3']
export const DEPTS: Dept[] = Object.entries(raw.departments).map(([id, d], i) => ({ id, name: d.name, color: d.office?.color ?? PALETTE[i % PALETTE.length] }))

export interface Desk {
  id: string
  base: string
  name: string
  role: string
  dept: string
  kind: RawAgent['kind']
  tools: string[]
  bashAllow: string[]
  /** model alias (opus/sonnet/haiku) per task size */
  modelFor: (size: Size) => { id?: string; alias?: string; effort?: string }
}

const UP = new Set(['mr', 'ci', 'qa', 'pm', 'db', 'hq'])
const nice = (id: string) => id.split('-').map((w) => (UP.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ')

export const DESKS: Desk[] = raw.agents.flatMap((a) => {
  const copies = a.max_parallel ?? 1
  const modelFor = (size: Size) => {
    if (!a.model) return {}
    const m = typeof a.model === 'string' ? { default: a.model } : a.model
    const alias = (size === 'L' && m.L?.model) || m.default
    const effort = (size === 'L' && m.L?.effort) || (m as { effort?: string }).effort
    return { alias, id: raw.models[alias]?.id ?? alias, effort }
  }
  return Array.from({ length: copies }, (_, i) => ({
    id: copies > 1 ? `${a.id}-${i + 1}` : a.id,
    base: a.id,
    name: a.names?.[i] ?? a.name ?? nice(a.id) + (copies > 1 ? ` ${i + 1}` : ''),
    role: nice(a.id),
    dept: a.dept,
    kind: a.kind,
    tools: (a.tools ?? []).filter((t) => /^[A-Z]/.test(t)), // drop MCP-ish names like "graphify"
    bashAllow: a.bash_allow ?? [],
    modelFor,
  }))
})
export const deskBases = new Set(DESKS.map((d) => d.base))
