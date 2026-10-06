import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Kit, KitItem } from '../shared/types'
import { KIT_DIR, PROJECT } from './config'

export const stripFrontmatter = (s: string) => s.replace(/^---[\s\S]*?\n---\s*/, '').trim()
function frontmatter(s: string): Record<string, string> {
  const m = s.match(/^---\n([\s\S]*?)\n---/)
  const out: Record<string, string> = {}
  for (const line of m?.[1].split('\n') ?? []) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const read = (p: string) => { try { return readFileSync(p, 'utf8') } catch { return undefined } }

/** where a project-relative kit file can come from, most specific first */
function candidates(rel: string, cwd: string): string[] {
  const base = path.basename(rel)
  const inKit = rel.includes('.cursor/rules') ? path.join(KIT_DIR, 'rules', base)
    : rel.includes('.claude/agents') ? path.join(KIT_DIR, 'agents', base)
    : path.join(KIT_DIR, rel)
  return [path.join(cwd, rel), path.join(PROJECT.path, rel), inKit]
}

/** Read e.g. ".claude/agents/wezeo-implementer.md" from the worktree, the project, or kit/. */
export function kitFile(rel: string, cwd: string): string | undefined {
  for (const p of candidates(rel, cwd)) { const s = read(p); if (s !== undefined) return s }
}

function list(dir: string, source: KitItem['source'], kind: 'dir' | 'md'): KitItem[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name): KitItem[] => {
    const p = path.join(dir, name)
    if (kind === 'dir') {
      if (!statSync(p).isDirectory()) return []
      const fm = frontmatter(read(path.join(p, 'SKILL.md')) ?? '')
      return [{ name: fm.name || name, description: fm.description, source }]
    }
    if (!/\.(md|mdc)$/.test(name)) return []
    const fm = frontmatter(read(p) ?? '')
    return [{ name: fm.name || name.replace(/\.(md|mdc)$/, ''), description: fm.description, source }]
  })
}
const merge = (...lists: KitItem[][]) => {
  const seen = new Map<string, KitItem>()
  for (const i of lists.flat()) if (!seen.has(i.name)) seen.set(i.name, i)
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

let cache: { at: number; kit: Kit } | undefined
/** What agents can use: the project's own .claude + .cursor, plus kit/ (project wins on name clashes). */
export function scanKit(): Kit {
  if (cache && Date.now() - cache.at < 30_000) return cache.kit
  const P = PROJECT.path
  const kit: Kit = {
    skills: merge(list(path.join(P, '.claude/skills'), 'project', 'dir'), list(path.join(KIT_DIR, 'skills'), 'kit', 'dir')),
    agents: merge(list(path.join(P, '.claude/agents'), 'project', 'md'), list(path.join(KIT_DIR, 'agents'), 'kit', 'md')),
    commands: merge(list(path.join(P, '.claude/commands'), 'project', 'md'), list(path.join(KIT_DIR, 'commands'), 'kit', 'md')),
    rules: merge(list(path.join(P, '.cursor/rules'), 'project', 'md'), list(path.join(KIT_DIR, 'rules'), 'kit', 'md')),
  }
  cache = { at: Date.now(), kit }
  return kit
}
