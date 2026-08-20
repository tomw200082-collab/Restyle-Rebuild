---
description: Compare the latest scorecard entry against the previous one
allowed-tools: Bash, Read, Grep, Glob
---

Read `quality/scorecard.json` and compare the last two entries.

Report:

1. **Verdict change.** `pass → fail` is the headline. `fail → pass` is worth
   saying plainly too.
2. **Per-stage transitions.** Only what changed:
   - `pass → fail` — a regression, and the most important thing on the page;
   - `fail → pass` — fixed;
   - `pass → skipped` — **coverage was lost**. This is easy to miss and reads as
     "nothing broke", which is not the same thing;
   - `skipped → pass` — coverage gained.
3. **Metric drift**, for stages that pass in both. Lighthouse scores, contrast
   element counts, axe serious counts, sitemap URL counts, test counts. Name any
   move of 3 or more points, and any test count that went **down** — a suite
   that shrank silently is a suite someone deleted from.
4. **Comparability.** If `target` differs between the entries, say so before
   anything else: a green run against an empty database measured less than a
   green run against a full one, and the two are not comparable.

If there is only one entry, say so and describe it instead of inventing a trend.

Keep it short. A stable scorecard should produce four lines, not four pages.
