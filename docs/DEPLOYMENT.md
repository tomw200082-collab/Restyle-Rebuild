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
- [ ] `ADMIN_EMAIL` signed in once and `/admin` loads for them.
- [ ] Production was **not** seeded (`npm run db:seed` creates fictional
      listings and three accounts with a known password).
- [ ] Supabase security advisor reports zero issues.
- [ ] Delivery zones and `site_config` reviewed in `/admin/config` — the seeded
      fees are the pilot's numbers, not necessarily today's.
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
