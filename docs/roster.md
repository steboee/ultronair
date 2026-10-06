# Ultronair roster — who works here and what they do

Machine-readable version: [`config/company.yaml`](../config/company.yaml).
How we keep the token bill low: [`docs/token-strategy.md`](token-strategy.md).

First client project: **iad-be**. Roles marked **reuses** wrap an existing agent from
`iad-be/.claude/agents/`.

**Design rule #1: an LLM only where judgement is needed.** Routing, verification, git,
CI polling and reviewer selection are deterministic, so **HQ code** does them for 0
tokens. In the office they still show up as "staff" (grey desks, no model badge) so you
can see the whole pipeline.

## Pattern: split-and-merge, not Agent Teams

| | Split-and-merge (subagents) | Agent Teams |
|---|---|---|
| How | Lead fans out isolated workers with fresh, small contexts; they return a short report; lead merges | Teammates are full sessions that message each other and share a task list |
| Tokens | **Low.** Each worker loads only its brief + rule pack | **High.** Every teammate carries a full context, and each message is extra turns on both sides |
| Fits | scouts, parallel reviewers, independent implementers | tightly coupled work that needs live negotiation |

Ultronair uses **split-and-merge everywhere**. The "shared task list" and "messages"
that Agent Teams give you come from HQ instead: task state plus handoff files, at zero
token cost.

## How the company talks

```
                          CEO (you)
                             │  tasks · approvals · answers
                             ▼
              HQ (code) ── router · budgets · git · verify · CI · reviewer picker
          ┌──────────────┬───┴──────────┬──────────────────┐
          ▼              ▼              ▼                  ▼
      PM Lead        Tech Lead       QA Lead*         Release (code)
     (Product)     (Engineering)      (QA)            └─ MR Writer
      │    │          │     │       │  │  │  │
   Scouts Legacy   Impl.×N Contract Primary Sec Fail DB
          Analyst                   Reviewer
                                   * only when ≥2 reviewers return findings
```

Rules (these are what the office lines show):

1. **Workers talk only to their lead:** they get a brief and return a report.
   **Briefs carry file paths, not file contents.**
2. **Leads never talk to each other.** A lead finishes by writing a handoff file, and HQ
   moves the task on. The office draws this as lead → HQ → lead.
3. **Questions bubble up:** worker → lead → HQ → you.
4. **One level of delegation** (runtime limit).

## Routes by task size (the biggest token saver)

| Size | Route | LLM sessions |
|---|---|---|
| **S** (clear bugfix, small change) | Triage → Implementer (briefed by HQ) → verify (code) → Primary Reviewer → MR Writer | ~4 |
| **M** (feature in one plugin) | Triage → PM Lead + 1–2 Scouts → ⏸ spec → Tech Lead → 1 Implementer → verify → Primary + path-picked specialists (→ QA Lead if ≥2 report) → MR Writer | ~8–10 |
| **L** (cross-plugin, legacy contract, permissions) | as M, but PM Lead on Opus, Legacy Analyst, 2+ Implementers, all relevant specialists | ~12–15 |

You can override the size, or set it yourself in the new-task form, which skips Triage.

## Handoff files (`.ultronair/<TASK>/` in the task worktree)

Hard size caps are the second-biggest token saver. Every reader pays for every line
written.

| File | Writer | Cap |
|---|---|---|
| `ticket.md` | HQ | as you wrote it |
| `triage.json` | Triage | ~15 fields |
| `findings/*.md` | Scouts, Legacy Analyst | **≤ 40 lines, file:line refs, no code dumps** |
| `spec.md` | PM Lead | ≤ 120 lines |
| `plan.md` | Tech Lead | ≤ 80 lines |
| `impl-<n>.md` | Implementer | ≤ 40 lines |
| `review.json` | reviewers / QA Lead | findings only, confidence ≥ 80 |
| `verify.json` | HQ verify script | failing lines only |
| `mr.md` | MR Writer | MR template |

Models: **Opus 5.5** `claude-opus-5-5` ($4/$20 per 1M tokens, input/output) ·
**Sonnet 5.5** `claude-sonnet-5-5` ($2/$10) · **Haiku 4.5** `claude-haiku-4-5` ($1/$5,
no effort setting).
**Seat policy:** exactly **one Opus seat** by default (the Tech Lead, where a good plan
saves implementer tokens). Sonnet does hands-on work and Haiku does read-heavy or
mechanical work.

---

## HQ — code, 0 tokens

| Duty | Replaces (from v0 roster) |
|---|---|
| Task state machine, worktree creation, briefs from templates, budgets, approval cards | — |
| **Reviewer picker**: path/diff rules decide which specialists run | QA Lead's selection step |
| **Verify script**: `composer test`, `pint --dirty --test`, `deploy/checks/*`, `git status` vendor-path check; parses Pest output; knows the `aCatalogueFund()` baseline | Verifier agent |
| **Release**: push branch + open MR via `glab` after your approval | Release Manager agent |
| **CI poller**: polls the GitLab pipeline; only on failure does it hand the failing job's log tail to Haiku | most of the CI Watcher |

## Triage
| | |
|---|---|
| Model | Haiku 4.5 |
| Trigger | new task in Inbox, unless you already set kind and size |
| Does | Sets kind (feature / bug / contract / refactor / chore), domain (onboarding, investment, fund, identity, middleware, Insyko, marketing), size S/M/L, `needs_legacy`, and a suggested budget. Drafts at most 3 clarifying questions. |
| Reads | `ticket.md` + `graphify query` (graph, not files) |
| Writes | `triage.json` |

---

## Product — *"what exactly are we building?"* (M/L only)

### PM Lead — orchestrator
| | |
|---|---|
| Model | Sonnet 5.5 `medium`; **Opus 5.5 for L** |
| Does | Sends out 1–2 Scouts (+ Legacy Analyst if `needs_legacy`) with one narrow question each. Writes the spec: behaviour, endpoints, roles/permissions, legacy vs local data, **testable acceptance criteria**, out of scope, and open **product decisions**. It never invents those; they go to you. |
| Writes | `spec.md` → approval card **"Approve spec"** |
| Tools | read-only + `graphify`; writes only in the task folder |

### Scout ×1–2 — **reuses `code-explorer`**
| | |
|---|---|
| Model | Haiku 4.5 |
| Does | Answers one question ("where does X live?", "which tests/trait cover Y?"), **graphify first**, then targeted reads |
| Writes | `findings/scout-<n>.md` (≤ 40 lines) |
| Tools | Read, Grep, Glob, `graphify` |

### Legacy Analyst — *new, iad-specific*
| | |
|---|---|
| Model | Sonnet 5.5 `low` |
| Trigger | `needs_legacy` (portfolio, transactions, funds, payments, clients, Insyko) |
| Does | Finds the `I…Service` in `appmiddleware.middleware` / `winsyko` that already owns the data, and says "mapping, not storing". It flags a needed new legacy endpoint as a product decision. |
| Writes | `findings/legacy.md` |

---

## Engineering — *"build it, test-first"*

### Tech Lead — orchestrator · **the one Opus seat**
| | |
|---|---|
| Model | Opus 5.5 `medium` (`high` for L) |
| Trigger | approved spec (M/L), or a fix round |
| Does | Writes `plan.md` (files, layering, endpoints, lang keys, tests) and splits the work into **disjoint-file units**, one Implementer each. On a fix round it **resumes the same Implementer session** (its context is cached) instead of starting a fresh one. Max 2 fix rounds, then you decide. |
| Tools | read-only + `graphify`; git merge via HQ |
| Skipped for S | HQ briefs the Implementer straight from the ticket |

### Implementer ×N — **reuses `wezeo-implementer`**
| | |
|---|---|
| Model | Sonnet 5.5 `medium` (`high` for L) |
| Does | Pest tests first → smallest change → focused test run (`--filter`) → **simplify pass on its own diff** (review.mdc Part 2, which replaces the separate Simplifier) → report. The full suite runs once, in the HQ verify script, not repeatedly inside the agent. |
| Writes | code + tests, `impl-<n>.md` (≤ 40 lines) |
| Tools | Read, Write, Edit, Bash (allow-listed), Grep, Glob. Writes blocked on `plugins/{w,wapi,winsyko,wintegration}/` and on secret files. No commit/push. |

### Contract Specialist — **reuses `contract-html`** (on demand)
Sonnet 5.5 `low`. Triggered by kind = contract, or when the plan touches
`apponboarding/onboarding/views/contracts/`. It turns a .docx into a Blade HTML/PDF
contract and reproduces the legal text exactly.

---

## QA — *"would a senior Wezeo dev approve this MR?"*

Reviewers are fanned out **by HQ in parallel** (path rules). All of them share one
cached prefix: rule pack + diff.

### Primary Reviewer — **merges `wezeo-reviewer` + `pr-test-analyzer`** · always runs
Sonnet 5.5 `medium`, read-only. One pass over the diff instead of two covers:
- absolute rules
- layering
- routes and permissions
- lang keys in all locales
- Scribe
- test behaviour, coverage, legacy faked, blast radius

It writes `review.json` directly.

### Specialists (path-triggered by HQ)
| Reviewer | Reuses | Model | Runs when the diff touches |
|---|---|---|---|
| Security Reviewer | `security-reviewer` | Sonnet 5.5 `medium` | routes, auth, permissions, disponent mode, request DTOs, resources with personal/financial data |
| Failure Hunter | `silent-failure-hunter` | Sonnet 5.5 `low` | `appmiddleware`, Insyko/`winsyko` calls, webhooks, `try`/`catch`, jobs |
| DB Reviewer | `database-reviewer` (needs October/Laravel tweak, drop Supabase advice) | Sonnet 5.5 `low` | `updates/` migrations, models, repositories, raw queries |

### QA Lead — orchestrator, conditional
| | |
|---|---|
| Model | Sonnet 5.5 `low` |
| Trigger | **only when ≥ 2 reviewers returned findings** |
| Does | Dedupes, checks each finding against the code (reading only the cited hunks), drops anything that contradicts `.cursor/rules/`, and gives a verdict: pass / fix (critical + important only) |
| Writes | merged `review.json` |

---

## Release — *"ship it"* (mostly code)

### MR Writer
Haiku 4.5. It fills the MR template (branch `PM-XXXX/<slug>`, title, what and why,
files, tests, the verification results, findings fixed/open, assumptions) from the
handoff files. Writes `mr.md` → approval card **"Open MR"**.

### CI Summarizer (the LLM half of CI watching)
Haiku 4.5. Runs only when HQ's poller sees a red pipeline. It reads the failing job's
log tail and writes a root cause in ≤ 5 lines to `ci.json`, then HQ routes the task back
to the Tech Lead.

---

## Not hired, and why

| Existing iad-be agent | Decision |
|---|---|
| `planner` | Folded into the Tech Lead |
| `code-simplifier` | Folded into the Implementer's last step (it is already step 5 of `wezeo-implementer`) |
| `pr-test-analyzer` | Merged into the Primary Reviewer |
| `code-reviewer`, `php-reviewer` | Overlap with the Primary Reviewer; opt-in second opinion for L only |
| `spec-miner` | Brownfield OpenSpec extraction, not ticket → spec; for a later Docs dept |
| `refactor-cleaner` | Its tooling is JS-only (knip, ts-prune) |
| `performance-optimizer`, `type-design-analyzer`, `tdd-guide` | Opt-in specialists |
| *Verifier*, *Release Manager*, *CI Watcher* (from the v0 roster) | Replaced by HQ code |

## Later

- **Docs dept:** Scribe regen, `graphify update .` after merge, rules upkeep.
- **Night shift:** scheduled scans that open Inbox tasks for your approval and never build
  on their own. These run through the Batch API, which costs 50% less because nothing is
  interactive.
