/**
 * Copy the client project's Claude Code kit into ./kit so it lives in this repo:
 *   .claude/agents/*.md  → kit/agents/
 *   .claude/skills/<x>/   → kit/skills/<x>/
 *   .claude/commands/**  → kit/commands/
 *   .cursor/rules/*.mdc  → kit/rules/
 * Usage: PROJECT_PATH=~/path/to/iad-be npm run kit:import
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { PROJECT, ROOT } from '../server/config'

const SECRET = /(^\.env|auth\.json$|credentials|secret|\.pem$|\.key$)/i
const src = PROJECT.path
if (!existsSync(src)) {
  console.error(`Project not found at ${src}. Set PROJECT_PATH.`)
  process.exit(1)
}
const kit = path.join(ROOT, 'kit')
const copied: Record<string, string[]> = {}

function copy(from: string, to: string, label: string, filter: (name: string) => boolean = () => true) {
  const dir = path.join(src, from)
  if (!existsSync(dir)) return
  mkdirSync(path.join(kit, to), { recursive: true })
  for (const name of readdirSync(dir)) {
    if (SECRET.test(name) || !filter(name)) continue
    cpSync(path.join(dir, name), path.join(kit, to, name), {
      recursive: true,
      filter: (p) => !SECRET.test(path.basename(p)),
    })
    ;(copied[label] ??= []).push(name)
  }
}

copy('.claude/agents', 'agents', 'agents', (n) => n.endsWith('.md'))
copy('.claude/skills', 'skills', 'skills', (n) => statSync(path.join(src, '.claude/skills', n)).isDirectory())
copy('.claude/commands', 'commands', 'commands')
copy('.cursor/rules', 'rules', 'rules', (n) => n.endsWith('.mdc') || n.endsWith('.md'))

console.log(`Imported from ${src}:`)
for (const [k, v] of Object.entries(copied)) console.log(`  ${k.padEnd(9)} ${v.length}: ${v.join(', ')}`)
if (!Object.keys(copied).length) console.log('  nothing found (.claude/ and .cursor/rules/ are empty or missing)')
console.log('\nReview with `git status kit/` before committing.')
