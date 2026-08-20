# Regression sentinel — `claude/restyle-os-run-2-hi1cdq` vs `main`

_2026-08-20 · `regression-sentinel` · `git diff main...HEAD` + working tree · **read-only**_

60 files changed, ~7,000 insertions, 10 deletions. Almost all of it is
governance, skills and gate tooling. Four files touch shipped product code.

## 1. Invariants touched

| touched | invariant in reach |
|---|---|
| `src/lib/jobs/index.ts` (`runJob` guard, `JobResult.halted`) | `CLAUDE.md` §6 kill switch; job idempotency; timing from database timestamps `[D-20]` |
| `src/app/api/cron/[job]/route.ts` (comment only) | constant-time bearer check on money-moving endpoints `[D-20]` |
| `src/app/login/login-form.tsx` (`placeholder`) | Hebrew UI, English code `CLAUDE.md` §3.5 |
| `src/app/page.tsx` (`alternates.canonical`) | one self-referencing canonical per indexable page `[D-67]` |
| `vitest.config.ts` (`server-only` alias) | test-harness integrity — a stub must not mask a real import error |
| `scripts/**`, `.claude/**`, docs | none — no runtime path |

**Untouched, and worth stating so a reviewer does not have to check:** no
migration, no RLS policy, no grant, no pricing code, no `src/lib/db/orders.ts`,
no payment adapter. **No money path changed in this branch.**

## 2. Required coverage

| change | required | present |
|---|---|---|
| kill-switch guard in `runJob` | halt proved for **every** job name, not a sample | ✅ `tests/unit/kill-switch.test.ts` enumerates `JOB_NAMES`, asserts `length === 7` |
| the guard must not be unconditional | a test proving a job **does** proceed without the switch | ✅ `runJob('housekeeping')` rejects on its missing dependencies |
| both switch mechanisms | file and env var each proved | ✅ two separate cases, plus `0`/`false`/`''` treated as off |
| switch read per call, not cached | throwing the switch mid-process takes effect | ✅ asserted without re-importing the module |
| Hebrew placeholder | copy lint covers it | ✅ `hebrew-copy` gate stage, now clean over 88 components |
| home-page canonical | a regression test that fails on the old code | ✅ `tests/e2e/seo.spec.ts` → "the home page is canonical to itself" |
| home-page canonical | a `SPEC.md` invariant | ✅ §6, `[D-67]` |
| `server-only` alias | must not hide a genuine missing module | ⚠️ see below |

## 3. Missing

**One item, and it is small.**

- **`vitest.config.ts` aliases `server-only` to a no-op stub.** That is correct —
  the guard is a build-time contract Next resolves through the `react-server`
  condition, and it should not stop a unit test covering a server module. But
  the alias is broad: any future import of a package *named* `server-only` in a
  test resolves to the stub silently. Low risk (one package, one purpose) and
  recorded rather than fixed, because narrowing it costs more config than the
  risk justifies. Revisit if a second alias ever appears.

**Everything else required by this diff is present.** In particular the two
product fixes in this branch both arrived with a regression test **and** a
`SPEC.md` invariant in the same commit, which is what
`restyle-spec-discipline` requires.

## 4. Coverage that is required but has not *run* here

Distinct from missing — these exist and could not execute in this environment:

- the **e2e suite** (69 tests) — refuses a non-localhost Supabase target by
  design `[D-65]`. The new canonical spec is among them, so it is **written and
  unexecuted**. CI runs it.
- the **RLS suite** — needs a seeded reference database.

Both are `skipped` with a reason in `quality/scorecard.json`, not passes. **This
branch is not L2-eligible until CI has run them on this commit.**

## Verdict

**Safe to open. Not yet safe to merge** — for the reason in §4, not for anything
in §3.
