# Restyle v2 — final report

A production-grade rebuild of restyle.co.il: from a Base44 no-code SPA to
Next.js 16 + Supabase, deliberately modelled on AptDeco and adapted to Gush Dan.

**Status: complete and green.** Every phase gate passed. 68 Playwright tests
across four actor roles, 77 unit tests, a full RLS assertion suite, and a
structured-data validator all pass against a real PostgREST enforcing real
policies.

---

## 1. What was built

| | |
|---|---|
| Migrations | 20, applied to both the local stack and the remote Supabase project |
| Routes | 37 pages, plus sitemap, robots, OG images, cron and webhook handlers |
| Application code | ~15,000 lines across 146 TypeScript files |
| SQL | ~2,300 lines |
| Tests | 77 unit, 68 end-to-end, plus RLS and JSON-LD suites |
| Decisions logged | 50 |
| Commits | 21, conventional, one per meaningful unit |

**Buyer** — catalogue with URL-state filters, item pages with a delivery
estimator, favourites, offers, checkout with on-platform payment, order
tracking with a live timeline, disputes.

**Seller** — a free four-step listing wizard with AI-drafted copy from photos,
a dashboard, one-tap sale confirmation with proposed pickup windows, and payout
visibility.

**Operator** — a role-gated cockpit: KPI dashboard, review queue, orders kanban,
per-order scheduling and state transitions, a per-day crew manifest, a payouts
ledger, a disputes console, an email log, and editors for fees and delivery
zones.

**Platform** — a SQL-enforced order state machine, an append-only audit,
seven idempotent cron jobs, sixteen Hebrew email templates, rate limiting,
a full SEO layer, and a legacy import that keeps every already-sent link alive.

---

## 2. The five decisions that shaped everything

Full reasoning for all fifty is in `docs/DECISIONS.md`.

**Money is `bigint` agorot, with the invariants in the database.** `[D-01]`
CHECK constraints enforce that commission + payout = item price and that the
total balances. A float rounding bug cannot express itself here; it is rejected
by the schema.

**Order state changes go through one SQL function.** `[D-04]` `transition_order()`
holds a transition table as data and takes a row lock. There is no
`UPDATE orders SET status` anywhere in the application, so an invalid transition
is impossible rather than merely uncommon — and the e2e suite proves a seller
cannot skip from `confirmed` to `delivered`.

**The audit log is append-only by privilege, not by convention.** `[D-05]`
`order_events` has `UPDATE` and `DELETE` revoked and a trigger that refuses
both. Nobody can rewrite what happened, including the service role.

**The seller's address is protected by column privileges.** `[D-06]`, `[D-45]`
RLS is row-level and structurally cannot protect a column. The grant is
enumerated column-by-column at migration time, so a column added later is
simply not granted — it fails closed.

**Public pages read through a cookie-free anonymous client.** `[D-46]`
Any component reading cookies makes its entire route dynamic, and the whole SEO
strategy rests on static rendering. Session state lives in one small client
component instead.

---

## 3. Defects found and fixed during the build

Thirteen, across six phases. Each is recorded in `docs/PROGRESS.md` with the
phase that found it. Five were serious.

**Every `SECURITY DEFINER` function was an anonymous RPC endpoint.** `[D-44]`
Postgres grants `EXECUTE` to `PUBLIC` by default and Supabase publishes
everything in `public` at `/rest/v1/rpc/*`. `transition_order` and `create_order`
were callable by anyone: an unauthenticated request could have moved any order
to `completed`, or created an order with an item price of zero. Found by
Supabase's own advisor after the first remote apply. Advisor: 20 warnings → 0.

**Every signed-in user could read every seller's home address.** `[D-45]`
Two mechanisms failed in sequence: a column-level `REVOKE` is inert on top of a
table-level `GRANT`, and that table grant covered `authenticated`. Since a
buyer legitimately reads any active listing's row, the address came with it —
the same defect the legacy platform had, arriving by a different route.

**The whole site rendered dynamically.** `[D-46]` Two independent causes: a
session-aware header in the root layout, and supabase-js's `no-store` fetch
default. Either alone deletes ISR. Caught by reading the build output, not by
anything failing.

**Every primary and danger button rendered dark text on clay instead of white.**
`[D-51]` `tailwind-merge` classified the custom `text-body-sm` font-size utility
as a colour and dropped `text-white` from the merge. Wrong since the design
system landed, in the most-clicked element in the product, invisible because
dark-on-clay is legible enough not to look broken. A contrast audit found it.

**`/sitemap.xml` returned 404.** `[D-49]` Next's `generateSitemaps` relocates
output to `/sitemap/<id>.xml` and publishes no index — so the single URL
robots.txt points at, and every crawler tries first, was missing. Nothing in the
application ever requests it, so nothing would have noticed.

The recurring shape is worth naming: **the most expensive defects were all
silent.** An empty page instead of an error, a 200 instead of a 404, a legible
wrong colour, a working endpoint that should not exist. None of them threw.
That is why `[D-47]` now requires every Supabase read to destructure and throw
its error, and why the test suite asserts on status codes, response headers and
computed contrast rather than only on rendered text.

---

## 4. Quality gates

All measured against a local production build.

| Check | Result |
|---|---|
| `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) | clean |
| `eslint .` | clean |
| Vitest | 77 passed |
| Playwright (anon / buyer / seller / admin) | 68 passed |
| RLS assertions, both directions per policy | passed |
| JSON-LD validator | passed |
| Supabase security advisor | 0 warnings; 3 INFO notices, all deliberate |

**Lighthouse (mobile):**

| Page | Performance | SEO | Accessibility | Best practices |
|---|---|---|---|---|
| `/` | 99 | 100 | 100 | 96 |
| `/item/[slug]` | 98 | 100 | 100 | 96 |
| `/category/[slug]` | 100 | 100 | 100 | 96 |

The Gate 4 end-to-end test drives one order through the entire lifecycle with
three real authenticated actors — approve → buy → confirm → schedule → pick up
→ deliver → (cron) complete → payout queued → paid — and asserts all nine
transitions in `order_events`, that the money still balances, and that the
seller was actually emailed at each step.

---

## 5. What Tom should decide before launch

Three things surfaced by the data that are business calls, not code.

**The pricing model is inverted for returning sellers.** The legacy platform
asked sellers for their **net** take and displayed gross; v2 asks for the
**asking price** and deducts commission from it. A returning seller who types
the same number they typed last time now receives 20% less. The Hebrew in the
sell wizard is explicit about which number is which, but the first cohort of
returning sellers will be surprised. Worth a one-off email before they list.

**The flat delivery fees may sit below cost.** Zone fees are ₪149/₪199/₪249
regardless of item size, and the legacy catalogue was ~60% tier-4 items — sofas
and wardrobes needing two people and a full van. Delivery margin is now a
first-class KPI on the dashboard `[D-37]` precisely so this can be measured
rather than argued about. Watch it for a month before changing anything.

**Seller non-response is the business.** 72% of legacy orders died waiting for
a seller to confirm. The window moved from 24h to 48h, a reminder job runs
inside it, confirmation is one authenticated tap, and the rate is the first KPI
on the dashboard `[D-43]`. That is everything the software can do; the rest is
seller onboarding.

Two published promises are now implemented that were not before: the ₪50
post-confirmation cancellation fee `[D-40]`, and free resale within seven days
of delivery `[D-41]`. Both appeared in the legacy terms and neither was ever
enforced.

---

## 6. Deliberately out of scope

WhatsApp integration, a crew-facing app, automated payouts, buyer–seller chat,
reviews and ratings, auctions, multi-language, native apps, a B2B portal, and
subscriptions. The crew manifest is copyable text because that is what the ops
flow needs today; payouts are marked paid by hand because the money leaves by
bank transfer.

---

## 7. Where to start reading

1. `README.md` — run it locally in four commands.
2. `docs/RUNBOOK.md` — **Hebrew**, the daily operational guide.
3. `docs/DEPLOYMENT.md` + `docs/POST_RUN_HOOKUP.md` — going live.
4. `docs/DECISIONS.md` — read this before changing anything structural.
5. `.claude/skills/` — five living skills carrying the patterns this codebase
   depends on: the design system, the RTL rules, the database conventions, the
   SEO engine and the e2e approach. They were updated whenever a durable
   pattern was discovered, including several of the defects above.
