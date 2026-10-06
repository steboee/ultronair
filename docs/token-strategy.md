# Token strategy

Goal: the lowest cost **per merged task** (not per request). A cheap agent that causes
a third fix round is not cheap.

## Where tokens go (measured on iad-be inputs)

| Thing every agent would naturally read | Size | ≈ tokens |
|---|---|---|
| `.cursor/rules/backend.mdc` | 17.2 KB | ~4.3k |
| `review.mdc` | 11.5 KB | ~2.9k |
| `wezeo.mdc` | 8.6 KB | ~2.1k |
| `permissions.mdc` | 5.7 KB | ~1.4k |
| `testing.mdc` + `iad-workflow.mdc` + `CLAUDE.md` | 13.1 KB | ~3.3k |
| **All rules** | **~52 KB** | **~13k** |
| Full Claude Code harness system prompt + all tool definitions | — | large; avoided (see #3) |
| Raw `composer test` output | — | can be thousands of lines |

If each of ~10 agents reads the rules through tool calls, that is ~130k uncached input
tokens per task **before anyone looks at the code**. That is the first thing to kill.

## The levers, in order of impact

1. **Code instead of LLM for deterministic work.** HQ does routing, reviewer selection,
   verification, git, MR push and CI polling. That removes 3–4 agents entirely (see the
   roster's "Not hired" table).
2. **Size routes.** S tasks skip Product and the Tech Lead (~4 sessions instead of ~14).
3. **Lean harness.** The Agent SDK runs with a custom per-role system prompt instead of
   the full Claude Code preset. Each role gets **only the tools it needs**, no MCP servers,
   and no auto-loaded project settings. Tool definitions are tokens on every request.
4. **Rule packs instead of rule files.** Once per rules change (keyed by a hash of
   `.cursor/rules/*` + `CLAUDE.md`), we distill role-specific packs of ~1.5–3k tokens each:
   `implementer`, `reviewer`, `security`, `scout`. They sit in the system prompt, so
   they are cached. Agents may still open the full `.mdc` by path when the pack isn't
   enough.
5. **Prompt caching by design.** We use a fixed prefix order: role prompt → rule pack →
   (diff, for reviewers) → task brief. Cache reads cost a fraction of input price, and
   caches are per model, so the **parallel reviewers share one model and one prefix**. HQ
   warms the cache with the first reviewer before fanning out the rest.
6. **Briefs carry paths, not contents. Reports have caps.** Findings ≤ 40 lines,
   `impl` ≤ 40, spec ≤ 120, plan ≤ 80. Every reader pays for every line written.
7. **Navigate by graph.** Scouts and the PM Lead use `graphify query/path/explain`
   first, because a scoped subgraph is far cheaper than grep + reading whole files.
   iad-be already has the graph and the hooks.
8. **Trim tool output with hooks.** A PostToolUse hook cuts Pest output to the summary
   plus failures, `pint` to the file list, and long file reads to the requested range.
   Implementers run `--filter` tests; the full suite runs once, in the HQ verify script.
9. **Resume, don't restart.** Fix rounds resume the same Implementer session, which
   already holds the context and has it cached. Max 2 rounds; only critical and
   important findings are sent back.
10. **Right model, right effort.** One Opus seat (Tech Lead). Sonnet 5.5 at `low`/`medium`
    for most work and Haiku 4.5 for read-heavy or mechanical jobs. We raise effort only
    where the dashboard shows rework.
11. **Budgets as brakes.** Each task has a dollar cap; reaching it pauses the task and
    raises an approval card. Each department also has a daily cap.
12. **Batch for non-urgent work.** Night-shift scans go through the Batch API, which
    costs 50% less.

## What we deliberately don't do

- **Agent Teams.** Peer messaging between full sessions multiplies context. HQ plus
  handoff files give the same coordination for 0 tokens.
- **An LLM "CEO/router".** Triage on Haiku is enough, and you can skip it by setting the
  size yourself.
- **Downgrading the Tech Lead to save money.** A weak plan costs more in Implementer
  rework than the Opus seat costs.

## Measuring it

The dashboard keeps a cost ledger per agent × task × stage (input, cache read, cache
write, output, USD). Each lever above should show up as a change in it. In Phase 0 we
run the same 3 real iad-be tickets twice, once with the naive setup (agents read rules,
full harness) and once with the lean setup, and compare **$ per merged task**. Until
then, all savings here are expected, not measured.
