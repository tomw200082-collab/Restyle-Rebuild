# brain/

The operational reporting layer, built here and **designed to be lifted out**.

A sibling repository, `restyle-production-brain`, will hold daily operations —
the same shape as the operator's `gt-factory-os-production-brain`. Everything in
this directory is written so that move is a copy and a config change rather than
a rewrite.

```bash
npm run brief                     # the Hebrew morning brief
npm run brief -- --out=today.md
npm run weekly                    # week over week
```

## What is here

| file | what it is |
|---|---|
| `queries.ts` | the only place `brain/` reads the database. Selects from `brain_*` views and nothing else |
| `format.ts` | Hebrew formatting. Agorot → ₪ happens here, once, at display |
| `daily-brief.ts` | anomalies, seller response, the queue, money, catalogue, delivery margin, liquidity |
| `weekly-report.ts` | seven days against the seven before |

The metrics themselves are **not** here. They are SQL views in
`supabase/migrations/0030_brain_kpi_views.sql`, and that is deliberate — see
"The rule that makes extraction safe" below.

## Read-only, structurally

`brain/` takes the **anon key**, never a service-role key. Every `brain_*` view
is `security_invoker`, so RLS applies to the caller exactly as it does in a
browser: a non-admin querying one sees nothing rather than everything.

There is no write path in this directory, and there should never be one. A
report that can write is a report that can be wrong in a way that outlives the
morning it was wrong in.

## The rule that makes extraction safe

> **The views are the metric definitions. `brain/` renders them and computes
> nothing.**

This is the single constraint that makes a separate repository workable. Once
`restyle-production-brain` is its own repo it will not track this one's schema
changes, and the moment a number is computed in TypeScript it starts drifting
from the number on `/admin` — silently, because both look plausible. Keeping the
definitions in SQL means the schema and the metric move together, and a report
that reads a view either gets the current definition or fails loudly because the
view is gone.

So: if a report needs a number no view provides, the answer is a **new view in a
migration**, not a `select` with arithmetic in it. `ops-analyst` is given the
same instruction.

## Extraction plan

### Moves to `restyle-production-brain`

- `brain/**` — the four files above, unchanged.
- `scripts/release-gate/env.ts` — fifteen lines, no dependency.
- The three npm scripts: `brief`, `weekly`, and whatever the scheduled routine
  calls.
- Its own `.env` with `NEXT_PUBLIC_SUPABASE_URL` and the **anon key**. Nothing
  else. If a future report needs elevated access, that is a decision with an ADR
  behind it, not a copied variable.

### Stays here

- **The views**, in `supabase/migrations/`. The schema and its metric
  definitions live in the same repository, always. The brain repo reads them.
- **The release gate** and everything under `scripts/release-gate/`. That guards
  a deploy; this describes a business.
- **`.claude/agents/ops-analyst.md`** stays with the code it reasons about, and
  is pointed at the views by name.

### What changes on the way out

1. `brain/queries.ts` imports `loadEnv` from `../scripts/release-gate/env` —
   becomes a local `env.ts`.
2. `tsconfig` paths: nothing in `brain/` uses the `@/` alias, deliberately, so
   there is nothing to rewrite.
3. `package.json`: `@supabase/supabase-js` and `tsx` are the only dependencies
   these four files need.

That is the whole list, and keeping it that short is the point of the design.

## The scheduled routine

Mirrors the operator's 06:30 GT routine. In `restyle-production-brain`:

```
06:30 Asia/Jerusalem
  1. clone (or pull) restyle-production-brain
  2. npm ci
  3. npm run brief -- --out=briefs/$(date +%F).md
  4. deliver it — email, WhatsApp, or wherever the operator actually reads
  5. commit the brief
```

Committing each brief matters more than it looks: it turns the numbers into a
time series that can be diffed, in the same way `quality/scorecard.json` does for
quality. A brief that is only ever read is a brief that cannot be compared
against last month's.

The weekly report runs the same way, Sundays.

### Before it can run

- **A `SUPABASE_DB_URL` or anon key** for the target project.
- **Real data.** As of this writing the target has demo content and no orders,
  so the money sections read zero and say so rather than pretending.
- **An admin user.** `auth.users` had none before Run 2; whoever first signs in
  with `ADMIN_EMAIL` gets the role, and until then `/admin` has no operator.

## What the brief says when there is nothing to say

It says so. "אין חריגות" is a result, not a failure, and an empty money section
reads "אין עדיין הזמנות. הקטלוג חי, המחזור אפס."

That is deliberate. A report that pads an empty week with something is a report
that gets skimmed, and a skimmed report is one where a real anomaly goes past
unread on the week it actually appears.
