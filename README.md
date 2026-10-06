# Ultronair

A small AI dev company that runs on your machine. You ask it a question about the code, or give it a change to make. Questions go to an Analyst who answers from the code. Changes move from desk to desk (PM Lead, Tech Lead, Implementer, Verify, Reviewer, MR Writer) and stop twice for your approval: on the spec and on the merge request. A task board shows where every task is, who is working on it, how many tokens it used, and how much of your Claude session is left.

Every agent is a headless **Claude Code** run (`claude -p`) using your existing Claude Code login, inside a separate git worktree for each task. Your own checkout is never touched.

## Run it

You need Node 20+, git, and Claude Code installed and logged in (`claude` on your PATH).

```bash
npm install
PROJECT_PATH=~/path/to/your/repo npm run dev
```

Open **http://localhost:4400** and click **New task**.

- `npm run mock`: the same board with fake agents and no Claude calls. Good for a first look.
- `PROJECT_PATH` overrides `project.path` from `config/company.yaml`. That repo must be a git repo with `project.base_branch` (`main`).
- `ULTRONAIR_PUSH=1` also pushes the task branch after you approve the MR. Without it, HQ only commits on the branch in the worktree.
- `PORT` changes the port (default 4400).

## How a task moves

When you create a task you pick **Let HQ decide**, **Question** or **Change**. With "Let HQ decide", the Triage desk (Haiku) reads it first and picks the route. Routes come from `routes` in `config/company.yaml`:

| Route | Steps |
| --- | --- |
| Q (question) | Analyst reads the code and writes `answer.md`. Nothing is changed and no worktree is made. You can ask follow-ups on the same thread. |
| S | Implementer → Verify → Primary Reviewer → MR Writer → commit |
| M / L | PM Lead → **you approve the spec** → Tech Lead → Implementer → Verify → Primary Reviewer → MR Writer → **you approve the MR** → commit |

If a change ends with no code changed, HQ skips verify, review and the MR, and keeps the implementer's report as the answer.

- **Verify** runs `project.verify` commands in the worktree. When they fail, the log goes back to the Implementer.
- When the **Reviewer** asks for changes, the Implementer gets the findings. Both loops are capped by `routes.max_fix_rounds`.
- **Request changes** on a gate sends the document back to its author with your note.
- **Retry** resumes a stopped task from the step it stopped at, including after HQ restarts.
- **Usage:** each card and step shows the tokens it used, split into new, cached and output. The header shows your plan's **session (5-hour) and weekly limits** with reset times, as Claude Code reported them at the start of the latest run. Each task also shows where the session meter was when its first agent started and at its latest run. Other work in the same window counts too.

## Where things live

```
kit/                 Claude Code plugin loaded into every agent run (see kit/README.md)
  agents/            one file per desk (persona, tools, model) + the ecc-* agents
  skills/            ECC PHP/Laravel skills + Wezeo skills from `npm run kit:import`
  rules/, commands/  the project's .cursor rules and slash commands from `npm run kit:import`
config/company.yaml  departments, desks, models, routes, rule packs, project, verify commands
server/              HQ: pipeline, Claude Code runner, task store, HTTP + live updates
web/                 the task board (React + Tailwind, served by HQ through Vite)
shared/types.ts      the types both sides use
.ultronair/          runtime data (gitignored): tasks.json, handoff files, worktrees
```

Each task's handoff files (`spec.md`, `plan.md`, `impl.md`, `verify.log`, `review.md`, `mr.md`) are in `.ultronair/tasks/<KEY>/`, and you can read them in the task panel.

## Skills, agents and rules (the kit)

Every agent runs with `kit/` loaded as a Claude Code plugin. Agents run inside the project's worktree, so they also get the project's own `CLAUDE.md`, `.claude/skills`, `.claude/agents` and hooks. On top of that:

- **Skills:** every desk can use the Skill tool, e.g. Wezeo skills and ECC's `laravel-tdd`, `laravel-patterns`, `database-migrations`.
- **Subagents:** orchestrators (PM Lead, Tech Lead) can delegate read-only exploration to subagents like `scout` or `ecc-code-explorer`.
- **`reuses:`** on a desk in `company.yaml` merges that agent's playbook into the desk's prompt, e.g. `wezeo-implementer`, `wezeo-reviewer`, `ecc-planner`.
- **`rule_pack:`** on a desk injects the matching `.cursor/rules/*.mdc` files (`project.rule_packs`). Claude Code never loads those rules on its own.

To copy iad-be's Wezeo skills, agents, commands and `.cursor` rules into this repo:

```bash
PROJECT_PATH=~/path/to/iad-be npm run kit:import
```

The sidebar's **Kit** section lists everything the agents can use, and where each item comes from. You can also use the kit in your own Claude Code with `claude --plugin-dir ./kit`.

## Safety

- Each agent only gets the tools listed for its role in `config/company.yaml`. Only Implementers can edit files, and they can only run the Bash commands in their `bash_allow` list.
- Reviewers can run read-only git commands only.
- Agents are told to stay out of `protected_write_paths` and `secret_paths`, and never to commit or push. HQ does the commit after your approval.
- Questions run read-only in your project checkout (Read, Grep, Glob, skills).

The 3D office view is parked on the `office-3d` branch.
