# Ultronair

A small AI dev company that runs on your machine. You give it a task. Its desks pick the task up one after another (PM Lead, Tech Lead, Implementer, Verify, Reviewer, MR Writer), and it stops twice for your approval: on the spec and on the merge request. A task board shows where every task is and who is working on it.

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

The route depends on size, from `routes` in `config/company.yaml`:

| Size | Route |
| --- | --- |
| S | Implementer → Verify → Primary Reviewer → MR Writer → commit |
| M / L | PM Lead → **you approve the spec** → Tech Lead → Implementer → Verify → Primary Reviewer → MR Writer → **you approve the MR** → commit |

- **Verify** runs `project.verify` commands in the worktree. When they fail, the log goes back to the Implementer.
- When the **Reviewer** asks for changes, the Implementer gets the findings. Both loops are capped by `routes.max_fix_rounds`.
- **Request changes** on a gate sends the document back to its author with your note.
- **Retry** resumes a stopped task from the step it stopped at, including after HQ restarts.
- Each step's cost comes from Claude Code's own report and is shown on the card and in the task panel.

## Where things live

```
agents/*.md          one file per role: persona, tools, model (Claude Code subagent format)
config/company.yaml  departments, desks, models, routes, project, verify commands
server/              HQ: pipeline, Claude Code runner, task store, HTTP + live updates
web/                 the task board (React + Tailwind, served by HQ through Vite)
shared/types.ts      the types both sides use
.ultronair/          runtime data (gitignored): tasks.json, handoff files, worktrees
```

Each task's handoff files (`spec.md`, `plan.md`, `impl.md`, `verify.log`, `review.md`, `mr.md`) are in `.ultronair/tasks/<KEY>/`, and you can read them in the task panel.

The files in `agents/` follow Claude Code's subagent format, so you can also copy them into a project's `.claude/agents/` and use them directly in Claude Code.

## Safety

- Each agent only gets the tools listed for its role in `config/company.yaml`. Only Implementers can edit files, and they can only run the Bash commands in their `bash_allow` list.
- Reviewers can run read-only git commands only.
- Agents are told to stay out of `protected_write_paths` and `secret_paths`, and never to commit or push. HQ does the commit after your approval.

The 3D office view is parked on the `office-3d` branch.
