---
name: restyle-plan-execute
description: Use for any Restyle work spanning more than about three files, more than one commit, or any migration plus the code that depends on it. Triggers on "implement", "build the", "add support for", "migrate", "refactor", "multi-step", "phase", "plan this", "big change", or an approved mini-spec. Produces a plan file with phases and gates in the style of the master prompts, then executes it — following the plan or amending it explicitly, never silently.
---

# Restyle plan & execute

Adapted from `superpowers:writing-plans` and `superpowers:executing-plans`. The
shape kept is: **plan on disk, phases with gates, deviation is explicit.**
Restyle's addition is the gate format from the master prompts — a phase is not
done because the code exists, it is done because its gate produced evidence.

## When a plan is required

- more than ~3 files, or
- more than one commit, or
- **any migration** plus the code that depends on it, or
- anything touching money, order state, or listing state, or
- anything an operator would want to stop halfway through.

Below that, just do the work. A plan for a one-file change is the ceremony this
codebase's YAGNI ladder exists to prevent.

## Write the plan first

`docs/plans/YYYY-MM-DD-<slug>.md`. Assume the executor is a skilled engineer who
knows nothing about Restyle — because in a fresh session, that is exactly true.

```markdown
# <title>
_Plan | <date> | Status: draft | active | done_

## Goal
One paragraph. What is true when this is finished that is not true now.

## Source
The approved mini-spec (`docs/specs/<slug>.md`), the decision, or the operator
instruction. A plan with no source is a plan nobody asked for.

## Invariants at risk
Which `SPEC.md` / `CLAUDE.md` invariants this work could break, and how each
stays true. Money, RLS, the state machines, static rendering, sold-page-200.

## Files
Which files are created or modified, and what each becomes responsible for.
Decomposition is decided here, not discovered mid-task.

## Phases

### Phase 1 — <name>
Steps, each one action:
- [ ] Write the failing test for <behaviour>
- [ ] Run it; confirm it fails for the right reason
- [ ] <implementation step>
- [ ] Run the test; confirm it passes
- [ ] `npm run verify`
- [ ] Commit

**Gate 1:** <the checkable condition> — evidence: <path or command output>

### Phase 2 — <name>
...

## Out of scope
What this plan deliberately does not do. Prevents scope drift mid-execution and
gives the next session a starting point.

## Rollback
If this ships and is wrong, what undoes it. For a migration, name the forward
migration that reverses it — an applied migration is never edited or deleted.
```

## Gates, the master-prompt way

A gate is **checkable and evidenced**. Not "Phase 2 complete" but:

> **Gate 2:** the fee engine returns the bulky surcharge for all four size
> classes — evidence: `npx vitest run tests/unit/pricing.test.ts` → 24 passed.

Rules:

- **No gate, no phase.** A phase without a gate is a wish.
- **A skipped gate is a failed gate.** If it cannot run here, say so, say why,
  and say where it will run instead (usually CI). Never call it passed.
- **Evidence is a path, an output, or a URL.** `CLAUDE.md` invariant 12.

## Phase ordering for this codebase

Learned from Run 1 and R0; it is the order that avoids rework:

1. **Migration first, alone, then verify.** Apply it, run `/drift-check`, confirm
   the repo still mirrors the remote. A migration bundled with the code that
   uses it means a schema mistake is found by a TypeScript error three files
   later instead of by the diff.
2. **Regenerate types** (`npm run db:types`) as its own step. It touches a
   generated file and should not be tangled with hand-written changes.
3. **Pure logic before I/O.** The fee engine is pure and unit-testable in
   milliseconds. Get the arithmetic right before any component renders it.
4. **Server before client.** RSC data path, then the interactive shell.
5. **Hebrew copy with the component**, not after. Copy written later is copy
   written by an engineer.
6. **e2e last** — it is the slowest loop and the one that needs everything else
   working.

## Executing

1. **Read the plan critically before starting.** Concerns go to the operator
   *before* the first commit, not at Phase 4.
2. **Mirror the phases into the task list** so progress is visible.
3. **Follow the plan.** When reality disagrees with it — and it will — **amend
   the plan file in a commit that says so**, then continue. Silent deviation is
   the failure mode this skill exists to prevent: the plan becomes fiction and
   the next session trusts it.
4. **One commit per meaningful unit**, conventional messages, the *why* in the
   body.
5. **Cross-phase work goes in the plan's backlog, not into this phase.** Tranche
   discipline: if Phase 2 reveals work belonging to Phase 5, log it and carry on.
6. **Stop and ask** on: a blocker, a gate that fails twice for different
   reasons, an instruction you cannot interpret, or anything that turns out to
   be L4-or-above under `EXECUTION_POLICY.md`.

## Finishing

- Every gate has recorded evidence.
- `npm run verify` green; `npm run release-gate` green for anything
  user-visible.
- Plan status flipped to `done` with a closing note: what changed against the
  plan, and why.
- `docs/DECISIONS.md` entries written for every real choice.
- If anything escaped and was fixed along the way → `restyle-spec-discipline`
  backprop, same PR.
- The response ends with `Next action: <the single next step>`.
