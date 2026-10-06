# Ultronair — a mini AI dev company for Wezeo backend work

> Status: **MVP running** (see README). First client project: **iad-be**
> (`~/Documents/WORK/WEZEO/Projects/iad-backend/iad-be`).

## 0. What the MVP is (built)

The company works end to end on your machine. You add a task on the board, HQ runs the route for its size, and every LLM desk is a headless Claude Code run (`claude -p`) in the task's own git worktree. It stops for your approval on the spec and the merge request, then commits on the task branch. Tested on a sample repo for S and M tasks; the 3D office view is parked on the `office-3d` branch.

Decisions taken for the MVP, in answer to §11:
- **Where agents run:** locally, through the Claude Code CLI with your own login. Client code never leaves your machine.
- **Billing:** whatever Claude Code is logged in with. HQ shows the cost Claude Code reports for each step.
- **First view:** a plain task board (no 2D or 3D office yet).
- **Task source:** UI only.

Since then:
- **Questions:** a Q route sends questions to an Analyst. Nothing is changed and there is no review or MR. Follow-ups continue the thread.
- **Triage:** triage runs for "Let HQ decide" tasks and picks Q, S, M or L.
- **No-diff shortcut:** change tasks that end with no diff skip verify, review and the MR.
- **Kit:** `kit/` is a Claude Code plugin with the desks, ECC agents and skills, and imported Wezeo skills and rules. Desks get `reuses:` playbooks and `.cursor` rule packs.
- **Usage:** the board shows tokens and the plan's session and weekly limits instead of dollars.

Not built yet:
- scouts as separate desks (orchestrators can delegate to them as subagents)
- the specialist reviewers and the QA Lead
- budget caps
- a hook that enforces protected paths (agents are only told by prompt)
- GitLab MR creation and CI polling
- distilled rule packs (the full `.mdc` files are injected today; see token-strategy.md)

## 1. What we are building

A live "office" where every AI agent is a person at a desk. You (CEO) drop tasks in,
department leads (orchestrators) pick them up and delegate to their staff, and you
watch it happen in 2D/3D, with tasks and spending in plain view.

Per agent we always show:

| Field | Source |
| --- | --- |
| Name / role / type (e.g. *Tech Lead — orchestrator*, *Implementer — worker*) | `company.yaml` |
| Model + effort (e.g. `claude-sonnet-5-5`, `medium`) | `company.yaml`, confirmed by runtime events |
| Status: idle / thinking / running tool / waiting for you / blocked | runtime events |
| Current activity ("Editing `plugins/apponboarding/.../OnboardingService.php`", "Running `composer test`") | tool-use events |
| Current task (e.g. `PM-3598`) | task store |
| Who it talks to (lines: lead ⇄ worker, lead ⇄ lead) | spawn / handoff / message events |
| Spending: tokens in/out/cache, USD (agent, task, department, day) | usage events × price table |

## 2. What iad-be already gives us

iad-be already contains most of the "staff". Ultronair should reuse it rather than
reinvent it:

- **`/wezeo-task` command**: a single-orchestrator pipeline:
  explore (2–3 parallel `Explore`) → plan (ask on product decisions) → `wezeo-implementer`
  → parallel review (`wezeo-reviewer`, security, silent-failure-hunter, pr-test-analyzer)
  → fix loop (max 2 rounds) → own verification → report.
- **Agents in `.claude/agents/`**: `wezeo-implementer`, `wezeo-reviewer`, `contract-html`, and
  the `ecc-*` set (planner, spec-miner, code-explorer, code-reviewer, security-reviewer,
  database-reviewer, performance-optimizer, pr-test-analyzer, silent-failure-hunter,
  tdd-guide, refactor-cleaner, code-simplifier, type-design-analyzer). All are on Sonnet today.
- **Rules**: `.cursor/rules/*.mdc` (single source of truth), `CLAUDE.md` absolute rules
  (vendor plugins read-only, no model validation, legacy owns the data).
- **Verification gate**: `composer test`, `vendor/bin/pint`, `deploy/checks/{lang,class,yaml,sms}check.php`.
  There is one known failure that predates this work (`aCatalogueFund()` redeclare).
- **Code map**: graphify knowledge graph (`graphify-out/`) with hooks on Read/Grep.
- **Domain split** (useful for routing): onboarding/questionnaire, investment
  (portfolio, transaction, payment, request), fund, identity (`widentity`), middleware
  (legacy gateway), Insyko KYC, marketing, analytics.
- **Process**: Jira-style keys (`PM-3598`), GitLab MRs into `main`, trunk-based, GitLab CI.

**Hard constraint from both Claude runtimes:** delegation is only **one level deep**
(subagents cannot spawn subagents). So the hierarchy has to be:

```
CEO (you, via UI)
└── Ultronair HQ  ← our own code: task router, handoffs, budgets, approvals
    ├── Department lead = one agent session (orchestrator)
    │     └── workers = its subagents (one level)
    └── …next department
```

Department-to-department handoffs therefore go through **HQ, not LLM-to-LLM**, which
is also what makes them visible, auditable and budgetable.

## 3. The org chart (v1)

Full roster with every agent's job: [docs/roster.md](docs/roster.md). Config:
[config/company.yaml](config/company.yaml). Token rules: [docs/token-strategy.md](docs/token-strategy.md).

Summary: **HQ is code** (routing, reviewer picking, verification, release, CI polling).
LLM seats: Triage (Haiku) · Product: PM Lead (Sonnet; Opus for L), Scouts (Haiku), Legacy
Analyst (Sonnet) · Engineering: **Tech Lead (the one Opus seat)**, Implementers (Sonnet),
Contract Specialist · QA: Primary Reviewer (Sonnet), Security / Failure / DB
specialists picked by path rules, QA Lead only when ≥2 reviewers report · Release: MR
Writer and CI Summarizer (Haiku). The route depends on size: S tasks run ~4 sessions.

Task lifecycle (a kanban column for each step):

```
Inbox → Spec (Product) → ⏸ CEO approves spec → Build (Eng) → Review (QA)
      ⇄ fix loop, max 2 rounds → Verify (Release) → ⏸ CEO approves MR → Done
```

Handoffs move as files in the task's worktree (`.ultronair/<task>/spec.md`, `plan.md`,
`review.json`, `verify.log`), which matches the iad-be rule that each subagent must be
given paths, not the conversation.

## 4. Runtime options (how the agents actually run)

| | **A. Claude Agent SDK (local)** | **B. Managed Agents (Anthropic cloud)** | **C. Raw API + tool runner** |
| --- | --- | --- | --- |
| Reuses iad-be `.claude/agents`, rules, hooks, graphify | ✅ as-is | ❌ re-declare agents via API | ❌ rebuild everything |
| Runs PHP 8.4 / composer / Pest / private Wezeo composer repos | ✅ your machine | ⚠ container setup + vault for `auth.json` | ✅ you host |
| Client code + secrets stay local (IAD is a financial client) | ✅ | ⚠ repo goes to a cloud sandbox | ✅ |
| Live per-agent events | hooks (SubagentStart/Stop, Pre/PostToolUse) + message stream with subagent attribution | ✅ first-class: `session.thread_created`, `agent.thread_message_sent/_received`, `span.model_request_end.model_usage`, per-thread streams | you build it |
| Spend tracking | per-message usage + cost in the final result | ✅ `session.usage.list_cost`, per-thread cost, **hard $ budgets** | you compute |
| Runs 24/7 / on schedule without your laptop | ❌ | ✅ (scheduled deployments) | you host |
| Effort to MVP | **lowest** | medium | highest |

**Recommendation:** start on **A (Agent SDK, local, TypeScript)**, behind a small
`Runtime` adapter interface, so **B** can be added later for overnight or remote work
once the client data question is settled. C has no advantage here.

## 5. Architecture

```
┌──────────── apps/web (Vite + React) ────────────┐
│  Office view (react-three-fiber)                │  one scene, two cameras:
│    • 2D = orthographic top-down                  │  orthographic = 2D, perspective = 3D
│    • 3D = perspective, low-poly people at desks │
│  Task board (kanban) · Spend dashboard · Agent  │
│  drawer (live log, current file, messages)      │
└───────────────▲─────────────────────────────────┘
                │ WebSocket (normalized events) + REST
┌───────────────┴──── apps/server (Node/Fastify) ──┐
│  HQ: task router, dept queues, approvals, budgets│
│  Event bus → SQLite (Drizzle): tasks, agents,    │
│  events, cost ledger                             │
│  Runtime adapter ─┬─ AgentSdkRuntime (v1)        │
│                   └─ ManagedAgentsRuntime (later)│
│  Guardrails: worktree per task, PreToolUse deny  │
│  rules, secret-file deny list, $ caps            │
└───────────────┬──────────────────────────────────┘
                │ git worktrees
        iad-be (local clone) → GitLab MR (after your approval)
```

### Normalized event schema (the core contract)

```ts
type UEvent =
  | { t: 'agent.spawned';   agent: AgentId; parent?: AgentId; role; model; task }
  | { t: 'agent.status';    agent; status: 'idle'|'thinking'|'tool'|'waiting'|'blocked'|'done' }
  | { t: 'agent.activity';  agent; tool: string; summary: string; file?: string }
  | { t: 'agent.message';   from: AgentId; to: AgentId; kind: 'brief'|'report'|'handoff'|'question' }
  | { t: 'agent.usage';     agent; model; in; out; cacheRead; cacheWrite; usd }
  | { t: 'task.updated';    task; column; dept; assignees }
  | { t: 'approval.needed'; task; what: 'spec'|'mr'|'budget'|'question'; payload }
```

Each runtime maps its events to `UEvent`. The UI only knows `UEvent`, so replay,
time-travel and swapping runtimes come almost for free.

### Data model (SQLite)

`departments`, `agents` (role, type, model, effort, desk xy, dept), `tasks` (key, title,
spec, column, dept, parent, branch, mr_url, budget_usd), `events` (append-only),
`cost_ledger` (agent, task, dept, model, tokens…, usd, ts).

### Config: `company.yaml`

Departments, staff, models, effort, budgets and the project mapping (`iad-be` path,
verification commands, protected paths) live in one file you can edit. The office layout
is generated from it.

## 6. Guardrails (non-negotiable for a client repo)

- One **git worktree per task**. Agents never touch your working copy, never push to
  `main`, and an MR only happens after your click.
- Enforce the iad-be absolute rules with a **PreToolUse hook**: deny writes under
  `plugins/w/`, `plugins/wapi/`, `plugins/winsyko/`, `plugins/wintegration/`.
- **Secret deny list**: the iad-be folder contains `.env`, `auth.json`,
  `firebase-credentials.json`. Agents may not read or print them.
- Budget caps per task / department / day. Over budget: pause and ask you.
- Human gates: spec approval, MR creation, any question flagged "product decision"
  (matches `/wezeo-task` step 2).
- Tests never hit the network or pgsql (already an iad-be rule; the verifier checks it).

## 7. Spending model

List prices per 1M tokens (input / output): Opus 5.5 **$4 / $20**, Sonnet 5.5 **$2 / $10**,
Haiku 4.5 **$1 / $5**. Cache reads are much cheaper; large shared prefixes (rules,
CLAUDE.md) should hit cache.

Rough expectation for one medium iad-be ticket (spec → MR) after the token strategy: **≈ $2–6**. Most of that
goes to the implementer and the parallel reviewers. This is a guess until we measure it;
the Phase 0 spike produces the real number. Levers: Haiku for explorers and the CI
watcher, lower effort for workers, a reviewer subset based on what the diff touches,
and the fix loop capped at 2.

If agents run under a Claude subscription instead of an API key, the dashboard shows
**equivalent list cost** instead.

## 8. Giving tasks

- v1: "New task" form in the UI (title, description, optional Jira key, priority,
  budget, target department, or "let HQ route").
- v1.5: a Haiku triage step suggests the department and size, and drafts clarifying
  questions.
- v2: import from Jira (`PM-*`) / GitLab issues, post MR links back, and send Slack
  notes when the company needs you.

## 9. Phases

| Phase | Scope | Done when |
| --- | --- | --- |
| **0. Spike** (1–2 days) | Run Agent SDK headless on an iad-be worktree with `wezeo-implementer`; dump raw events to JSONL; build the mapping to `UEvent`; compute cost | We can attribute every tool call and token to the right subagent, and know real $/task |
| **1. MVP** | Server + SQLite + WebSocket; **Engineering dept only**; 2D office; task board; spend panel; new-task form | You give a task and watch the Tech Lead + implementers work live, with costs |
| **2. Company** | Product, QA and Release depts; HQ handoffs; approval gates; budgets; worktrees; guardrail hooks | A ticket goes Inbox → MR draft, with you clicking only the gates |
| **3. Office 3D** | 3D camera, avatars with animations (typing, thinking bubble, waiting = raised hand), animated message particles on lines, timeline replay | Looks like a company |
| **4. Scale** | Jira/GitLab/Slack, Managed Agents runtime option, scheduled crews (nightly tech-debt, dependency checks), multiple projects | Runs without your laptop open |

## 10. Repo layout (as built)

```
ultronair/
  kit/                 Claude Code plugin: desks (agents/), ecc-* agents, skills, imported rules/commands
  config/company.yaml  departments, desks, models, routes, project
  server/              HQ: pipeline, Claude Code runner, JSON task store, HTTP + SSE
  web/                 task board (React + Tailwind via Vite middleware)
  shared/types.ts
```

One package and one process (`npm run dev`). The runtime is the `claude` CLI behind `server/runner.ts`, so the Agent SDK or Managed Agents can replace it later without touching the pipeline.

## 11. Open decisions (need your call)

1. **Where agents run**: local Agent SDK (recommended) vs Anthropic cloud. This depends
   on whether IAD client code may leave your machine.
2. **Billing**: API key (exact $) or Claude subscription (equivalent $)?
3. **Departments**: are the four above right? Should Engineering instead split by domain
   (Onboarding / Investment / Identity squads)?
4. **First view**: 2D first (faster) with 3D in phase 3, or 3D from the start?
5. **Task source**: UI-only first, or connect Jira from day one? (Atlassian connector
   needs authorizing.)
6. **Budget defaults**: per task cap (e.g. $15) and daily cap (e.g. $50)?
