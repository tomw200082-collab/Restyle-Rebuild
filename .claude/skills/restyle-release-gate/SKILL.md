---
name: restyle-release-gate
description: Use before merging to main, before any deploy, when a scorecard needs reading or comparing, when a gate stage fails, or when adding a new gate stage. Triggers on "release gate", "can we merge", "ready to ship", "scorecard", "gate failed", "L2", "go/no-go", "deploy", "quality check", "is this green". Carries the thirteen stages and the defect class each one prevents, the fail-closed rule, what a skip means and when it is allowed, how to read quality/scorecard.json, and how to add a stage.
---

# Restyle release gate

`npm run release-gate` → `quality/scorecard.json`.

**The gate is the only path to L2.** No scorecard entry with a `pass` verdict,
no merge to `main`. `EXECUTION_POLICY.md` §L2.

## The one rule

> **It fails closed.** A stage that errors, times out, or cannot run did not
> pass.

Three statuses, and the distinction between the last two is the entire design:

| status | means |
|---|---|
| `pass` | the check ran, and the product satisfied it |
| `fail` | the check ran, and the product did not |
| `skipped` | the check could **not** run here — and says why |

A `skipped` stage is **never** counted as a pass. The verdict is `pass` only
when every stage passed; skips alone still produce `fail`, with a message
saying so. This is not pedantry — it is the direct lesson of `[D-49]` and
`[D-51]`, where a check that quietly did nothing was read as green.

## Running it

```bash
npm run release-gate                          # full run; starts its own server
npm run release-gate -- --fast                # static stages only, quick signal
npm run release-gate -- --base-url=https://…  # audit a deployed origin
npm run release-gate -- --no-append           # do not write to the scorecard
```

Target database comes from `NEXT_PUBLIC_SUPABASE_URL` (loaded from `.env.local`
by the gate itself — Next does that for the app, a `tsx` script does not).
`DATABASE_URL` points at the local reference database the RLS suite needs.

## The thirteen stages, and what each prevents

Order is cheapest-first, so a typecheck error costs seconds rather than a full
browser pass. The server is started lazily — only after `build` passes — because
starting it first would serve the *previous* build when the current one is
broken, and every measurement after that describes a version that no longer
exists. Run 1 lost time to exactly that twice.

| # | stage | prevents |
|---|---|---|
| 1 | `build` — typecheck, lint, production build | the obvious, cheaply |
| 2 | `unit` | fee-engine arithmetic, slug and scheduling regressions |
| 3 | `rls` | a policy regression silently opening a table `[D-31]` |
| 4 | `e2e` — four actor roles | an illegal state transition becoming possible `[D-04]` |
| 5 | `jsonld` | broken structured data — Google ignores the block, the page still renders |
| 6 | `hebrew-copy` | English leaking into a Hebrew UI |
| 7 | `status-codes` | **the soft-404 class** `[D-49]` |
| 8 | `contrast` | **the tailwind-merge class** `[D-51]` |
| 9 | `axe` | accessibility regressions, 0 critical |
| 10 | `lighthouse` | SEO = 100 and a11y ≥ 95 hard; performance floor 70, target 90 tracked `[D-80]` |
| 11 | `rtl-screenshots` | an RTL layout break at 390px — `dir` and sideways overflow `[D-79]` |
| 12 | `sold-200` | throwing away the inbound link a sold item earned `[D-33]` |
| 13 | `sitemap-coverage` | a route missing from the sitemap, or a sitemap URL that 404s |

Two of these deserve their reasoning restated, because they are the ones a
future session will be tempted to simplify:

**`status-codes` asserts the code, not the content.** A test asserting on
rendered text passes against a soft-404, because a soft-404 renders. Expected
status is read from each page's own source — a page calling `requireUser`
should redirect, and that is correct behaviour, not a defect. It also asserts
that a URL which *should not* resolve actually 404s: a catch-all rendering a
friendly page for anything is the same defect wearing the other face.

**`contrast` measures the pixel, not the class list.** `tailwind-merge`
classified a custom font-size utility as a colour utility and dropped
`text-white` from every primary button. The class list was correct right up
until the merge ran. So the probe walks the ancestor chain for the real
background, flattens alpha, and computes the WCAG ratio in a real browser.

## Skips, and when one is allowed

A skip is allowed for L2 **only** when both hold:

1. its reason is in `ALLOWED_SKIPS` (`scripts/release-gate/types.ts`), and
2. **CI ran that stage on the same commit.**

| reason | meaning |
|---|---|
| `no-listings-in-target-database` | item pages, Product JSON-LD, sold-page — nothing to measure |
| `rls-fixture-absent` | the reference database has no seeded rows to assert against |
| `browser-unavailable` | no Chromium, no server origin, or `--fast` |
| `lighthouse-unavailable` | `lighthouse` not installed |

Anything else makes the run ineligible however many stages passed, and the gate
prints which skips fell outside the list.

**The e2e skip is a safety guard, not a limitation.** The suite signs up users,
creates listings and drives orders to payout. Against the production project
that would be real users and real orders, so it refuses any target that is not
a localhost Supabase origin. CI provides one with `supabase start`.

## Reading the scorecard

`quality/scorecard.json` is `{ version, entries[] }`, appended per run, and
committed — so quality has a time series rather than an anecdote.

Each entry: `at`, `commit`, `branch`, `verdict`, `complete` (no skips at all),
`counts`, `target`, and every stage with its detail, duration, metrics and
evidence paths.

`/scorecard` diffs the latest against the previous. What to look at, in order:

1. **`verdict`** — anything but `pass` blocks L2.
2. **`complete`** — `false` means part of the picture is missing, even at
   `pass`.
3. **`target`** — a green run against an empty database measured less than a
   green run against a full one. Compare like with like.
4. **Metric drift** — `lighthouse.home.performance` sliding 96 → 91 is passing
   and is still the most useful line in the file.

## Adding a stage

1. **Name the defect class it prevents**, in a comment above it, with the
   `[D-NN]` if there is one. A stage that cannot name its failure is ceremony,
   and ADR-001 says to delete it.
2. Implement in `scripts/release-gate/stages-static.ts` (no server) or
   `stages-browser.ts` (server or browser), returning `{status, detail,
   evidence, metrics, failures}`.
3. Register it in `STAGES` in `scripts/release-gate.ts`, in cost order.
4. If it can be unavailable, return `skipped` with a **reason**, and add the
   reason to `ALLOWED_SKIPS` only if a skip is genuinely acceptable for L2.
5. Give it a stable `id` — the scorecard is diffed on ids, so renaming one
   breaks the time series.
6. Prove it fails: break the thing on purpose, watch it go red, put it back.
   A stage never seen red is a stage nobody should trust.

## When a stage fails

Do **not** relax the stage. Go to `restyle-root-cause-debug`, find the
mechanism, fix it, then `restyle-spec-discipline` to backprop the invariant and
the regression test in the same PR.

The one legitimate reason to change a stage is that it is **wrong** — a false
positive, like a copy lint reading a TypeScript generic as prose. Then fix the
stage, and say in the commit why it was wrong, so the next person does not
"fix" it back.

## Environment notes that cost time to learn

- **Playwright pins a browser revision** and refuses anything else. Images with
  a pre-installed Chromium therefore have a working browser Playwright will not
  use, and six stages would report `browser-unavailable`.
  `scripts/release-gate/browser.ts` falls back to a system Chromium and **says
  which one it used** — a gate quietly measuring a different browser than it
  claims would be its own silent-failure class.
- **Kill stray `next-server` processes before measuring.** A detached
  `next start` that outlives its shell keeps the port and serves a deleted
  build. `pgrep -af next-server` settles it.
- **`npm run db:reset` before a Lighthouse run** on a local target: the e2e
  suite leaves listings whose photos were never uploaded, and their 404s are
  scored against the product.
