# Ultronair kit

A Claude Code plugin. HQ loads it into every agent run (`claude -p --plugin-dir kit`), so every desk can use these skills, and orchestrators can delegate to these agents. You can also load it in your own Claude Code with `claude --plugin-dir ./kit`.

| Folder | What | Source |
| --- | --- | --- |
| `agents/<role>.md` | Ultronair's desks (PM Lead, Tech Lead, Implementer, …). HQ uses each body as that desk's system prompt. | this repo |
| `agents/ecc-*.md` | Planner, code explorer, reviewers (code, security, DB, PHP, tests, silent failures), TDD guide, refactor, simplifier. These are the same `ecc-*` agents iad-be uses. | [everything-claude-code](https://github.com/affaan-m/everything-claude-code) @ `ef648e0`, MIT, see `LICENSE-ECC` |
| `skills/` | ECC skills for PHP/Laravel work: `laravel-*`, `database-migrations`, `postgres-patterns`, `api-design`, `backend-patterns`, `coding-standards`, `security-review`, `tdd-workflow`, `verification-loop`, `search-first`, `git-workflow`. Imported Wezeo skills land here too. | ECC + `npm run kit:import` |
| `rules/` | `.cursor/rules/*.mdc` from the client project, injected into desks as rule packs (`project.rule_packs` in `config/company.yaml`). | `npm run kit:import` |
| `commands/` | Slash commands from the client project (e.g. `/wezeo-task`). | `npm run kit:import` |

## Importing the Wezeo skills, agents and rules from iad-be

```bash
PROJECT_PATH=~/Documents/WORK/WEZEO/Projects/iad-backend/iad-be npm run kit:import
```

This copies the project's `.claude/agents`, `.claude/skills`, `.claude/commands` and `.cursor/rules` into this folder. Files with the same name are overwritten, so iad-be's own `ecc-*` versions win over the upstream ones. It skips settings, hooks and anything that looks like a secret. Review the diff before you commit: these are the client's internal docs.

Agents that run inside an iad-be worktree also pick up iad-be's own `.claude` directly. The import is what makes them part of this repo, so they are versioned here and available when you work on other projects.
