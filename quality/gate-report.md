# Release gate report — scorecard v1

_`release-gatekeeper` · scorecard entry `2026-08-20T09:24:28.637Z` · commit `b43758a` · branch `claude/restyle-os-run-2-hi1cdq`_

## Verdict

> **`fail (skips only)` — NOT eligible for L2.**

8 passed · 0 failed · 5 skipped. **Nothing is broken.** Five stages could not
run in this environment, and a skipped stage is never a pass `[D-63]`. Every
skip reason is inside `ALLOWED_SKIPS`, so the second condition — CI having run
these stages on this commit — is the only thing between this branch and L2
eligibility. G5 supplies it.

This is the first entry: there is no previous run to diff against, so no
regression analysis is possible yet. Scorecard v2 will have one.

## Passed — 8

| stage | result |
|---|---|
| `build` | typecheck (strict, `noUncheckedIndexedAccess`), lint, production build — all clean |
| `unit` | 85 passed (77 inherited + 8 new kill-switch tests) |
| `hebrew-copy` | no English leakage across 88 components |
| `status-codes` | 21 routes at their expected status, and both unknown-slug probes correctly 404 |
| `contrast` | 179 interactive elements at or above WCAG AA, computed in a browser at 390px |
| `axe` | 0 critical violations across 16 pages; 0 serious |
| `rtl-screenshots` | 10 pages match their committed baseline hashes |
| `sitemap-coverage` | 21 sitemap URLs, all resolving; 11 indexable routes covered, none missing |

Lighthouse measured what it could reach:

| page | performance | SEO | accessibility | budget |
|---|---|---|---|---|
| home | **94** | **100** | **100** | ≥90 / =100 / ≥95 |
| category | **94** | **100** | **98** | ≥90 / =100 / ≥95 |

Both above budget on every axis.

## Skipped — 5, each with what would unblock it

| stage | reason | unblocked by |
|---|---|---|
| `rls` | reference database has no seeded rows to assert against | CI: `supabase start` + `db:seed` (G5) |
| `e2e` | target is production; the suite writes users and orders, so it refuses `[D-65]` | CI's local stack (G5) |
| `jsonld` | no active listings — no `Product` block exists to validate | demo content (P1) |
| `lighthouse` | no item page to measure; home and category **were** measured and passed | demo content (P1) |
| `sold-200` | no sold listing to check | demo content (P1) |

**Read that column carefully:** three of the five are *data* preconditions and
two are *environment* preconditions. Neither kind is evidence about the product,
and neither is a pass. The gate says `fail` for exactly that reason.

## What this run does and does not prove

**Proves:** the code compiles under strict TypeScript, the unit suite is green,
every public route returns the status it should, no interactive element on any
public page fails AA contrast, no critical accessibility violation exists, the
Hebrew UI has no English leakage, the RTL layout at 390px is stable against a
baseline, and the sitemap and the live routes agree in both directions.

**Does not prove:** that RLS still denies what it should, that the order state
machine still refuses an illegal transition, that an item page renders correct
`Product` structured data, that a sold page still returns 200, or that the item
page meets its performance budget.

The second list is not smaller than the first, and it contains the checks that
guard money and privacy. **That is why skips block L2.**

## Recommendation

1. Land G5 so CI runs `rls` and `e2e` on every PR.
2. Land P1's demo content so `jsonld`, `sold-200` and the item-page Lighthouse
   budget become measurable against the real remote.
3. Re-run the gate. A `pass` verdict with `complete: true` is the L2 gate,
   and it needs an `AUTONOMY_LOG.md` entry when it is used.

## Evidence

- scorecard: `quality/scorecard.json`
- run artifacts: `quality/runs/2026-08-20T09-24-28-637Z/` — `status-codes.txt`,
  `contrast.txt`, `axe.txt`, `lighthouse.json`, `sitemap-coverage.txt`,
  `screenshots.txt`, `hebrew-copy.txt`, `build.log`, `unit.log`, `entry.json`
- baselines: `quality/baselines/*.sha256`
