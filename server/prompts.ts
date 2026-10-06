import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Task } from '../shared/types'
import { KIT_DIR, PROJECT, type Desk } from './config'
import { kitFile, stripFrontmatter } from './kit'

/** kit/agents/<role>.md is the source of truth for each desk's persona; we use its body as the system prompt. */
export function rolePrompt(base: string): string {
  const f = path.join(KIT_DIR, 'agents', `${base}.md`)
  return existsSync(f) ? stripFrontmatter(readFileSync(f, 'utf8')) : ''
}

/** Shared rules every agent gets, appended to Claude Code's own system prompt. */
const HOUSE = () => `You work at Ultronair, an AI dev company, on the project "${PROJECT.id}".
You are one desk in a pipeline; HQ (code) moves the task between desks and the CEO approves specs and merge requests.
Rules:
- Follow the repository's CLAUDE.md and rule files.
- Never modify these paths: ${PROJECT.protected_write_paths.join(', ') || '(none)'}.
- Never read or print secrets: ${PROJECT.secret_paths.join(', ') || '(none)'}.
- Do not commit, push, or create branches. HQ does that.
- Finish with your report as plain Markdown. Keep it short: the next desk reads it.`

const taskBlock = (t: Task) => `# Task ${t.key}: ${t.title}
Size: ${t.size}
${t.description ? `\n${t.description}\n` : ''}`

const feedbackBlock = (t: Task) => (t.feedback ? `\n## CEO feedback on the previous version\n${t.feedback}\n` : '')

/**
 * A desk's full system prompt: house rules + its kit/agents role, then what the client project adds:
 * the agents it `reuses` (e.g. wezeo-implementer, ecc-code-explorer) and its rule pack (.cursor/rules).
 */
export function systemFor(d: Desk, cwd: string): string {
  const parts = [HOUSE(), rolePrompt(d.base)]
  for (const rel of d.reuses) {
    const s = kitFile(rel, cwd)
    if (s) parts.push(`## Playbook: ${path.basename(rel, '.md')}\nFollow this where it does not conflict with your role above.\n\n${stripFrontmatter(s)}`)
  }
  for (const rel of (d.rulePack && PROJECT.rule_packs[d.rulePack]) || []) {
    const s = kitFile(rel, cwd)
    if (s) parts.push(`## Project rules: ${path.basename(rel)}\n\n${stripFrontmatter(s)}`)
  }
  parts.push(`## Skills
Skills from the project and the Ultronair kit (Wezeo conventions, ECC: laravel-tdd, laravel-patterns, laravel-security, database-migrations, api-design, tdd-workflow, verification-loop, …) are available through the Skill tool. Before you start, load the ones that match this work and follow them.`)
  if (d.spawns.length) parts.push(`## Delegation
You may delegate read-only exploration to subagents with the Task tool (for example scout, legacy-analyst or ecc-code-explorer). Ask for short reports. Do not delegate code changes: HQ assigns those.`)
  return parts.filter(Boolean).join('\n\n')
}

/** The task message each desk receives. Persona and output format live in agents/<role>.md. */
export const ROLE: Record<string, { prompt: (t: Task, ctx: Record<string, string>) => string }> = {
  triage: {
    prompt: (t) => `# New task ${t.key}: ${t.title}
${t.description ? `\n${t.description}\n` : ''}
Is this a question or a change? If a change, how big? Answer with the JSON only.`,
  },
  analyst: {
    prompt: (_t, c) => `${c.previous ? `## Earlier questions and your answers on this thread\n${c.previous}\n\n` : ''}## Question
${c.question}

Answer it from the code in this repository. Do not change anything.`,
  },
  'pm-lead': {
    prompt: (t) => `${taskBlock(t)}${feedbackBlock(t)}
Explore the code that this task touches, then write the spec.
Your final message must be the spec in Markdown, at most 120 lines, with these sections:
## Goal
## Scope (files and modules likely to change)
## Acceptance criteria (checklist)
## Out of scope
## Risks and open questions`,
  },
  'tech-lead': {
    prompt: (t, c) => `${taskBlock(t)}
## Approved spec
${c.spec ?? '(no spec: small task, plan straight from the description)'}

Read the relevant code, then write the plan.
Your final message must be the plan in Markdown, at most 80 lines: the files to change and what to change in each, the tests to add, and the order of work.`,
  },
  implementer: {
    prompt: (t, c) => `${taskBlock(t)}
${c.spec ? `## Spec\n${c.spec}\n` : ''}${c.plan ? `## Plan\n${c.plan}\n` : ''}${c.fix ? `## Fix request (round ${t.fixRound})\n${c.fix}\n` : ''}
Implement it now. Make the smallest change that meets the acceptance criteria.
Your final message: a short report (max 40 lines) with the files you changed, the tests you ran and their result, and anything left undone.`,
  },
  'primary-reviewer': {
    prompt: (t, c) => `${taskBlock(t)}
${c.spec ? `## Spec\n${c.spec}\n` : ''}## Base branch
${PROJECT.base_branch}

Review the uncommitted changes in this worktree (run \`git diff\` and \`git status\`). Check correctness, tests, and the repository rules.
${c.verify ? `\n## Verify output (tail)\n\`\`\`\n${c.verify}\n\`\`\`\n` : ''}
End your final message with a JSON block exactly like:
\`\`\`json
{"verdict": "approve" | "changes", "findings": ["…"]}
\`\`\`
Use "changes" only for real problems (bugs, missing tests for new behaviour, rule violations), not style nits.`,
  },
  'mr-writer': {
    prompt: (t, c) => `${taskBlock(t)}
${c.spec ? `## Spec\n${c.spec}\n` : ''}${c.impl ? `## Implementer report\n${c.impl}\n` : ''}${c.review ? `## Review\n${c.review}\n` : ''}
Look at \`git diff --stat\` if useful. Your final message is the MR description in Markdown: a one-line title starting with "${t.key}", then Summary, Changes, How to test.`,
  },
}

/** Canned answers for the mock runtime. */
export const MOCK: Record<string, (t: Task) => string> = {
  triage: (t) => `\`\`\`json\n${JSON.stringify(/\?\s*$|^(what|where|how|why|which|who|can|does|is)\b/i.test(t.title) ? { kind: 'question', size: 'S', why: 'mock' } : { kind: 'change', size: 'M', why: 'mock' })}\n\`\`\``,
  analyst: () => `Activation onboarding has 4 steps (mock answer).\n\n1. Personal details – \`plugins/apponboarding/classes/Steps.php:12\`\n2. Questionnaire – \`…:30\`\n3. KYC (Insyko) – \`…:48\`\n4. Contract signing – \`…:66\`\n\n**Not sure about:** nothing, this is the mock runtime.`,
  'pm-lead': (t) => `## Goal\n${t.title}.\n\n## Scope\n- plugins/apponboarding/classes/OnboardingService.php\n\n## Acceptance criteria\n- [ ] Works for the happy path\n- [ ] Covered by a Pest test\n\n## Out of scope\n- UI changes\n\n## Risks and open questions\n- Legacy owns the data; no model validation.`,
  'tech-lead': () => `1. Add \`ResumeLink\` service.\n2. Call it from \`OnboardingService::pause()\`.\n3. Pest test for expired links.`,
  implementer: () => `Changed OnboardingService.php and added ResumeLinkTest.php.\nRan composer test: green.`,
  'primary-reviewer': () => `Looks good.\n\n\`\`\`json\n{"verdict": "approve", "findings": []}\n\`\`\``,
  'mr-writer': (t) => `${t.key} ${t.title}\n\n## Summary\n…\n\n## Changes\n…\n\n## How to test\n\`composer test\``,
}
