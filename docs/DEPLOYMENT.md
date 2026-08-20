# Deployment

Vercel for the application, Supabase for the database. Nothing else is required
to go live.

## Before the first deploy

1. **Supabase is ready.** Follow `docs/POST_RUN_HOOKUP.md` — migrations applied,
   storage bucket present, auth redirect URLs set, admin account confirmed.
2. **`npm run verify:all` passes locally**, against the project you are about to
   deploy to.
3. **Decide the providers.** The defaults are `mock` for payments, email and AI.
   A production deploy that leaves `PAYMENT_PROVIDER=mock` will happily take
   fake payments and mark real orders paid — see the checklist below.

## Environment variables

Set every one of these in Vercel under **Settings → Environment Variables**, for
Production and Preview.

| Variable | Production value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://restyle.co.il` | Wrong value ⇒ every canonical, OG image and email link is wrong. It also decides whether HSTS and `upgrade-insecure-requests` are sent. |
| `NEXT_PUBLIC_SUPABASE_URL` | project URL | inlined into the browser bundle at build time |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key | safe to expose; RLS protects every table |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key | **bypasses RLS entirely.** Never `NEXT_PUBLIC_`. |
| `ADMIN_EMAIL` | the operator's address | granted admin on first sign-in |
| `CRON_SECRET` | `openssl rand -hex 32` | guards `/api/cron/*`, which cancel orders and issue refunds |
| `PAYMENT_PROVIDER` | `sumit` or `payplus` | **not `mock`** |
| `SUMIT_API_KEY`, `SUMIT_COMPANY_ID` | from Sumit | or the PayPlus trio |
| `EMAIL_PROVIDER` | `resend` | `mock` sends nothing at all |
| `RESEND_API_KEY` | from Resend | |
| `AI_LISTING_ENABLED` | `true` to enable | falls back to a fixture when false or the key is missing |
| `ANTHROPIC_API_KEY` | from Anthropic | |
| `NEXT_PUBLIC_GA_ID` | optional | also needs the GA host added to the CSP — see below |

Two variables are read at **build** time and baked in: `NEXT_PUBLIC_*` values go
into the browser bundle, and `NEXT_PUBLIC_SITE_URL` and
`NEXT_PUBLIC_SUPABASE_URL` are additionally read by `next.config.ts` to build the
CSP and the image allow-list. Changing either requires a **redeploy**, not just
a restart.

## Deploying

```bash
# From the Vercel dashboard: New Project → import the repository.
# Framework preset: Next.js. Build command and output directory: defaults.
```

No `vercel.json` build configuration is needed. The file that is there exists
only to declare the cron schedule.

After the first successful deploy, confirm under **Settings → Cron Jobs** that
all seven appear:

| Job | Schedule | What it does |
|---|---|---|
| `seller-timeout` | every 15 min | cancels and refunds orders the seller never confirmed |
| `seller-reminder` | hourly | nudges the seller inside the confirmation window |
| `abandoned-checkout` | every 15 min | releases listings held by unpaid checkouts |
| `offer-expiry` | hourly | expires offers past their window |
| `protection-window` | every 30 min | completes delivered orders and queues payouts |
| `listing-expiry` | daily 03:00 | expires stale listings |
| `housekeeping` | daily 03:30 | prunes old rate-limit windows |

Every job derives its timing from stored timestamps and is idempotent: a missed
run catches up, a double run is a no-op, and a retry never refunds twice.

## Custom domain

Add `restyle.co.il` in **Settings → Domains** and follow the DNS instructions.
Then:

- Set `NEXT_PUBLIC_SITE_URL` to the final origin and **redeploy** (it is baked
  in at build time).
- Update the Supabase auth Site URL and redirect URLs to match.
- Confirm `https://restyle.co.il/sitemap.xml` returns a sitemap index and
  `robots.txt` points at it.
- Submit the sitemap in Google Search Console.

## Go-live checklist

Run through this in order; the first four are the ones that lose money.

- [ ] `PAYMENT_PROVIDER` is **not** `mock`. With mock, `/pay/mock/[orderId]` is
      a live page with a "payment succeeded" button that marks a real order paid.
- [ ] `EMAIL_PROVIDER=resend` and the key works. With `mock`, nothing is sent —
      sellers are never told they have a sale, which is the single failure mode
      the legacy platform died of.
- [ ] `CRON_SECRET` is set and long. These endpoints cancel orders and issue
      refunds; an unguarded one is a public endpoint that moves money.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is not exposed: `grep -r NEXT_PUBLIC_SUPABASE_SERVICE` returns nothing, and it is not in any committed file.
- [ ] `NEXT_PUBLIC_SITE_URL` is the real origin, and the deploy happened *after*
      it was set.
- [ ] `ADMIN_EMAIL` signed in once and `/admin` loads for them. **As of the
      post-run reconciliation this has not happened**: the remote project has
      zero rows in `auth.users` and zero in `profiles`, so no admin exists yet.
      The address must sign in before anyone else does — the `handle_new_user`
      trigger grants the role on first sign-in.
- [ ] Production was **not** seeded (`npm run db:seed` creates fictional
      listings and three accounts with a known password). Note that the
      taxonomy and delivery zones do **not** need seeding: `0024` ships all 12
      categories, 12 brands and 21 zones as part of the migrations, the same way
      `0013` ships `site_config`. Verified present on the remote.
- [ ] Supabase security advisor reports zero warnings. Three INFO notices
      are expected and correct: `legacy_users`, `legacy_orders` and
      `rate_limits` have RLS enabled with no policies, which denies everything
      to anon and authenticated — the intended posture for service-role-only
      tables. Do not "fix" them by adding a policy.
- [ ] Delivery zones and `site_config` reviewed in `/admin/config` — the fees
      that ship are the pilot's numbers, not necessarily today's. Zones are
      A ₪149 / B ₪199 / C ₪249 across 21 Gush Dan municipalities.
- [ ] A real end-to-end purchase completed on production with a real card and a
      real refund. Nothing else proves the PSP wiring.

## Analytics

`NEXT_PUBLIC_GA_ID` alone is not enough: the CSP does not allow
`https://www.googletagmanager.com`. Add it to `script-src` and `connect-src` in
`next.config.ts` in the same change. That is deliberate — a CSP that
pre-authorises a script host nobody uses is a hole kept open for convenience.

## Rolling back

Vercel keeps every deployment. **Deployments → ⋯ → Promote to Production** on
the last good one is an instant application rollback.

Database migrations do **not** roll back with it. They are written to be
additive and forward-only, so an application rollback is safe against a newer
schema; the reverse — rolling the database back under a newer application — is
not, and is why there are no down-migrations.

## Monitoring

- **Vercel → Logs** for runtime errors. Every server error carries a `digest`,
  and the error page shows the user the same digest, so a support message can be
  matched to a log line.
- **`outbound_events`** is the email log: one row per send, with status and the
  failure reason. `select * from outbound_events where status = 'failed'`.
- **`order_events`** is the append-only audit for every order. It cannot be
  edited or deleted, by anyone, including the service role.
- **`/admin`** carries the two KPIs that decide the business: the
  seller-confirmation rate and the delivery margin.

---

# v2 — CI, branch protection, and the release gate

Added in Run 2. Everything above still applies; this section is about what
guards `main` and what runs before a deploy.

## GitHub Actions secrets and variables

**Settings → Secrets and variables → Actions.**

| name | kind | needed by | value |
|---|---|---|---|
| `SUPABASE_DB_URL` | secret | `drift-weekly.yml` | Supabase → Project Settings → Database → **Connection string (URI)**, the direct connection, not the pooler |
| `ANTHROPIC_API_KEY` | secret | `claude.yml` | only if you enable the @claude responder |
| `CLAUDE_ENABLED` | variable | `claude.yml` | set to `true` to enable it; anything else leaves it off |

`ci.yml` and `release-gate.yml` need **no secrets at all**. They run against a
local Supabase stack that `supabase start` creates per run, with keys it
generates itself. That is deliberate: the end-to-end suite signs up users and
drives orders through to payout and refund, and against the real project it
would do all of that for real `[D-65]`.

`drift-weekly.yml` **fails loudly if `SUPABASE_DB_URL` is missing** rather than
skipping. A drift check that quietly does nothing every Monday is worse than no
drift check, because it looks like one.

## The four workflows

| workflow | when | what it proves |
|---|---|---|
| `ci.yml` | every PR, and pushes to `main` | typecheck, lint, unit, the static gate stages; and — on a real Supabase stack — the **RLS suite**, the **e2e suite across four actor roles**, and JSON-LD |
| `release-gate.yml` | PRs targeting `main` | the **full** gate: contrast, axe, Lighthouse budgets, RTL visual diff, sitemap coverage, sold-page 200. Uploads `scorecard.json`, commits the entry on green |
| `drift-weekly.yml` | Mondays 05:00 UTC, or on demand | `supabase/migrations` still equals the live schema, object by object. Opens (or updates) an issue on drift |
| `claude.yml` | `@claude` on a PR | disabled until `CLAUDE_ENABLED=true` |

`ci.yml` is the fast lane and `release-gate.yml` is the slow one. Splitting them
is not cosmetic: a gate slow enough to be resented is a gate people route
around, and the browser-heavy stages are most of the wall clock.

## Branch protection — use classic protection, not rulesets

**Settings → Branches → Add branch protection rule**, not **Settings → Rules →
Rulesets.**

They look interchangeable and are not. Since mid-2026, a required status check
configured through a **ruleset** does not reliably clear a pull request's
auto-merge: the checks go green, the PR stays queued, and there is nothing in
the UI that says why. Classic branch protection does not have the problem. If
you have already created a ruleset, delete it — a repository with both is worse
than either, because the effective policy is the union and neither page shows it.

Configure on `main`:

- ✅ **Require a pull request before merging**
- ✅ **Require status checks to pass before merging**, and require the branch to
  be up to date. Required checks, by their **job names**:
  - `typecheck · lint · unit` and `RLS · e2e · JSON-LD` (from `ci.yml`)
  - `full release gate` (from `release-gate.yml`)
- ✅ **Require conversation resolution before merging**
- ✅ **Do not allow bypassing the above settings** — including for
  administrators. An exception that exists is an exception that gets used at
  22:00 on a Thursday.
- ❌ **Do not** allow force pushes or deletions on `main`.

A check only becomes selectable after it has run once, so open a throwaway PR
first, let both workflows complete, then add them as required.

## Auto-merge, and the 422 retry

`gh pr merge --auto` intermittently returns **HTTP 422** when auto-merge is
requested in the same moment the required checks are still registering. It is a
race, not a rejection: the same call succeeds seconds later.

```bash
# Enable auto-merge, retrying the 422 race.
for attempt in 1 2 3 4 5; do
  if gh pr merge --auto --squash "$PR"; then
    echo "auto-merge enabled"; break
  fi
  echo "attempt $attempt failed (likely the 422 race); retrying in $((attempt * 4))s"
  sleep $((attempt * 4))
done
```

Do not paper over it by disabling required checks to "get the merge through".
That is the entire protection, and a 422 is a scheduling artefact.

## What may merge, and who merges it

Merging to `main` is **L2** under `EXECUTION_POLICY.md`. It requires:

1. a `quality/scorecard.json` entry with `verdict: "pass"` **on the commit being
   merged** — a pass on a different commit is not a pass on this one;
2. every required check green;
3. no unresolved review threads;
4. an `AUTONOMY_LOG.md` entry: timestamp, level, action, evidence path.

A skipped gate stage is never a pass. A local run will always show skips —
no local environment has a browser, a writable Supabase, a seeded reference
database and Lighthouse at once — which is exactly why CI exists and why the
verdict is only meaningful when CI produced it.

## Before deploying

Run `/go-no-go`. It checks, and stops at the first failure: the kill switch is
absent, the gate is green **on this commit**, `supabase/migrations` equals the
live schema, and the environment is sane — including that `PAYMENT_PROVIDER` is
what you expect, since switching it to a live provider is **L5**.

Deploying is **L3**, requires L2 first, and needs its own `AUTONOMY_LOG.md`
entry.

## Enabling the @claude responder

1. Create an API key and add it as the `ANTHROPIC_API_KEY` **secret**.
2. Add a repository **variable** `CLAUDE_ENABLED` set to `true`.
3. Comment `@claude …` on a pull request.

The job additionally requires the commenter to be an `OWNER`, `MEMBER` or
`COLLABORATOR`, so a drive-by comment from a fork cannot task an agent that
holds `contents: write`. Until step 2 is done the workflow is inert — the guard
is a condition rather than a commented-out block, because a commented-out
workflow is invisible to `actionlint` and rots without anyone noticing.
