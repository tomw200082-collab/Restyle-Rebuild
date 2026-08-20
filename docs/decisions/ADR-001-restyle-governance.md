# ADR-001 — Adopt a governance layer for Restyle

- **Status:** Accepted
- **Date:** 2026-08-20
- **Deciders:** the operator (Tom), by the instruction to execute Master Prompt 2
- **Supersedes:** nothing
- **Ratifies:** `CLAUDE.md`, `EXECUTION_POLICY.md`, `SPEC.md`, `ops/KILL_SWITCH`,
  `AUTONOMY_LOG.md`

---

## Context

Run 1 shipped a working marketplace: 37 routes, 24 migrations, 146 TypeScript
files, 77 unit and 69 end-to-end tests, all gates green. It also shipped
thirteen defects that were found *during* the build, five of them serious. The
build found them because a human was reading every diff.

That does not survive contact with operation. From here the repository will be
changed by agent sessions that do not share memory, do not share context, and
each believe themselves to be the first. The question this ADR answers is not
"how do we write good code" — run 1 answered that — but **"what stops the
fifteenth session from undoing what the first one proved?"**

The operator already runs this pattern successfully elsewhere: a
`gt-factory-os-production-brain` repository holding a constitution, an
execution policy with a graded autonomy ladder, ADRs, a kill switch and an
append-only audit; and a `gt-factory-os-portal` holding an Improvement OS of
release gates, scorecards, subagents, hooks and drift detection. The pattern
works there. This ADR adopts it here.

**It is adopted, not copied.** GT's governance protects inventory truth in a
manufacturing business. Restyle holds strangers' money between two households
and moves their furniture with its own crew. The invariants are different, the
autonomy ceiling is different, and the L5 list here is written around money
movement and buyer trust rather than around stock accuracy.

## Decision

Adopt a five-artifact governance layer:

1. **`CLAUDE.md`** — the constitution. Identity, fixed stack, twelve hard
   invariants, write boundaries, and a sole-author clause that makes the file
   itself un-editable by agents.
2. **`EXECUTION_POLICY.md`** — an L0–L5 autonomy ladder with per-level triggers,
   evidence requirements, and an operator-preset bounds table for the config
   values an agent may move without asking.
3. **`docs/decisions/`** — ADRs for architectural and governance choices,
   alongside the existing `docs/DECISIONS.md` for implementation decisions.
4. **`ops/KILL_SWITCH`** — a file whose presence halts every cron job and every
   subagent.
5. **`AUTONOMY_LOG.md`** — append-only, one line per L2-or-above action and per
   refused L5 request.

## Why each gate exists — anchored to a defect that actually happened

A governance artifact that is not anchored to a real failure is ceremony. Each
of these is anchored.

### The soft-404 class → status-code assertions in the release gate

`/sitemap.xml` returned 404 in production-shaped builds. `generateSitemaps`
relocates output to `/sitemap/<id>.xml` and publishes no index, so the single
URL `robots.txt` points at — and every crawler tries first — was missing.
`[D-49]`

Nothing in the application ever requests that URL, so no page broke, no test
failed, and no error was thrown. The class is broader than the instance: **an
HTTP response that is wrong but not an error.** A test that asserts on rendered
text cannot see it.

→ The gate asserts the **status code** of every public route, and
`CLAUDE.md` invariant 7 names it. `route-auditor` re-checks it on demand.

### The contrast class → computed-contrast assertions

Every primary and danger button rendered dark text on clay instead of white,
from the day the design system landed. `tailwind-merge` classified the custom
`text-body-sm` font-size utility as a colour utility and dropped `text-white`
from the merge. `[D-51]`

The result was legible enough not to look broken, in the most-clicked element
in the product. The class: **a visual defect that renders successfully.**
Asserting on the class list would not have caught it — the class list was
correct before the merge ran.

→ The gate measures **computed** colour in a real browser on every interactive
element and checks WCAG AA. `CLAUDE.md` invariant 8 names it.

### The seed-drift class → idempotent seeds and reference-data protection

The operator seeded reference data directly into production through the MCP.
Seven slugs differed from canonical, and `/category/[slug]` and `/brand/[slug]`
resolve by slug — so seven routes would have 404'd. One row named סילון (Silon,
an Israeli manufacturer) carried the slug `sealy` (an American company). All
twelve categories had a null `intro_he`, so every category page would have
rendered without the paragraph it is built around.

The class: **two writers to one dataset, neither aware of the other.**

→ Every seed is idempotent and matches on natural keys, never on ids. Demo
content is flagged `is_demo` and removable. Reference rows seeded by the
operator are corrected in place, never deleted and re-inserted. `CLAUDE.md`
§4 puts reference data behind a gate.

### The migration-count-drift class → object-level drift detection

The report said 22 migrations; the remote ledger said 23. Both were right, about
different questions — one extra remote entry, `rate_limits_public_schema`,
applied on its own remotely and folded into `0020` in the repository. It took a
manual audit to establish that, and the audit had to be redone in Run 2 because
nothing recorded the answer in a re-runnable form.

The class: **"the repo is the source of truth" as a belief rather than a
measurement.**

→ `/drift-check` and `drift-weekly.yml` diff `supabase/migrations` against the
live schema at object level — 920 objects, function bodies hashed from
`prosrc`, policy expressions, column grants and RLS flags included — and open an
issue on any difference. Run 2's R0 proved it at `010d7f55b049c4c2cb83711cf0ab28b3`
on both sides. File counts are never the measurement again.

### The common shape

All four are **silent**. An empty page instead of an error, a 200 instead of a
404, a legible wrong colour, a working endpoint that should not exist, a
schema that "matches" because nobody diffed it. None of them threw.

That is the thesis of this governance layer: **the gate exists to make silent
failures loud**, and every stage of it maps to a class of silence that has
already cost this project time.

## Consequences

**Good**

- A fresh session reading `SPEC.md` and `CLAUDE.md` inherits the reasoning, not
  just the code.
- `main` acquires a defined admission criterion: the scorecard.
- Silent-failure classes become mechanical checks instead of reviewer vigilance.
- Money paths acquire an explicit ceiling that no amount of agent confidence
  crosses.
- The scorecard is versioned and diffable, so quality has a time series rather
  than an anecdote.

**Costs, accepted**

- The gate is slow — browsers, Lighthouse, visual diffs. Mitigated by `ci.yml`
  running the fast checks on every push and the full gate only on PRs to `main`.
- Governance can become ceremony. Mitigated by the anchoring rule above: a gate
  stage that cannot name the defect class it prevents is a candidate for
  deletion at the next review.
- Autonomy bounds will be wrong at first, because they are guesses made before
  production data exists. They are expected to move; `EXECUTION_POLICY.md` says
  how.

## Alternatives rejected

**Copy `gt-factory-os-production-brain` verbatim.** Rejected: its invariants are
about inventory truth, its L5 list is about stock mutations, and its gates are
built for a manufacturing workflow. Importing them unchanged would produce rules
nobody could anchor to a Restyle defect — the exact ceremony this ADR warns
against.

**Rely on the existing `docs/DECISIONS.md` alone.** Rejected: 60 excellent
entries that are a *history*, not a *policy*. They record what was chosen; they
do not state what may be done without asking. A new session can read all 60 and
still not know whether it is allowed to merge.

**Rely on code review by the operator.** Rejected: it is what Run 1 did, it
worked, and it does not scale past one human reading every diff. It also does
not survive the operator being unavailable, which is the case the kill switch
and the ladder exist for.

**Branch protection and CI only, no constitution.** Rejected: CI can prove tests
pass. It cannot express "money is agorot", "sold pages never 404", or "never
switch the payment provider". Those are the rules that matter most and none of
them is a test failure.

**A single combined `GOVERNANCE.md`.** Rejected: the sole-author clause needs a
file the operator alone owns. Mixing an operator-only constitution with an
agent-amendable policy in one file makes the boundary unenforceable — and the
`PreToolUse` hook that blocks edits needs one unambiguous path to block.

## Verification

This ADR is satisfied when:

- [x] `CLAUDE.md`, `EXECUTION_POLICY.md`, `ops/KILL_SWITCH`, `AUTONOMY_LOG.md`
      and this file exist.
- [x] Every cron job checks the kill switch before doing work, proven by test.
- [x] `SPEC.md` exists and states the invariants a fresh session must not
      violate.
- [x] The release gate runs end to end and emits `quality/scorecard.json`.
- [x] A `PreToolUse` hook blocks writes to `CLAUDE.md`.
