# Ops analysis — KPI pack

_2026-08-20T09:36Z · `ops-analyst` · **read-only** against project `vntihvctqueohwprafwh` (production)_

## Headline: the platform is live and empty

Every operational counter is zero. That is the expected state — nobody has
signed in yet, so no profile exists, so no listing exists.

| KPI | value | note |
|---|---|---|
| GMV (completed) | ₪0 | 0 completed orders |
| Platform take | ₪0 | — |
| Active listings | 0 | catalogue renders, nothing in it |
| Sold listings | 0 | — |
| Sell-through rate | n/a | no denominator |
| Median time-to-sale | n/a | no sales |
| Review-queue depth | 0 | nothing awaiting approval |
| Review-queue latency | n/a | — |
| Open offers | 0 | — |
| Offer acceptance rate | n/a | — |
| Orders awaiting seller confirmation | 0 | **the KPI that matters most once live** |
| Deliveries scheduled | 0 | — |
| Delivery lead time | n/a | — |
| Unpaid payouts | 0 | — |
| Open disputes | 0 | — |
| Failed notifications | 0 | — |
| Liquidity by category | n/a | 12 categories, 0 items |
| Profiles | 0 | — |
| `auth.users` | 0 | — |

Reference data is present and correct: **12 categories, 12 brands, 21 delivery
zones, 19 `site_config` rows.**

## Anomalies

**One, and it blocks launch rather than operation.**

- **No admin user exists.** `auth.users` = 0 and `profiles` with `role='admin'`
  = 0. The `handle_new_user` trigger grants the admin role on profile creation
  to whoever signs in with `ADMIN_EMAIL`. Nobody has ever signed in, so the
  cockpit has no operator. **The first sign-in must be `tom@gteveryday.com`**,
  and `ADMIN_EMAIL` must be set in the deployed environment before it happens —
  it is currently only in a local `.env.local`.

Nothing else is anomalous. Zero orders stuck in a non-terminal state, zero
failed notifications, zero unpaid payouts, no cron backlog. An empty system with
clean counters is a healthy empty system.

## Not anomalies, recorded so they are not re-flagged

- **0 listings on a live catalogue** is the known state, not a fault. P1 seeds
  demo content.
- **0 `legacy_redirects`** — the Base44 export has not been delivered. Every
  already-sent `/ItemDetails?id=…` link therefore resolves to `/catalog` rather
  than to its item. Not a defect; a dependency.
- **0 `storage.objects`** — the `listing-photos` bucket exists and is empty.

## What to watch first, once there is traffic

In priority order, with the reason each earns its place:

1. **Seller non-response rate.** 72% of legacy orders died waiting for a seller
   to confirm. It is the business, not a metric.
2. **Delivery margin by zone × size class.** Zone fees are flat (₪149/₪199/₪249)
   and the legacy catalogue was ~60% tier-4 items. This is the number the bulky
   surcharge exists to move, and it should be measured for a month before
   anything else changes.
3. **Review-queue latency.** Every listing is human-approved; the queue is the
   growth ceiling.
4. **Offer acceptance rate.** Tells you whether `offer_min_pct = 60` is set right
   before anyone argues about it.

## Method

Read-only. One `SELECT` with thirteen scalar subqueries, executed through the
Supabase MCP. No writes, no mutating function calls, no `SELECT … FOR UPDATE`.

`brain/` does not exist yet, so this run computed its counts inline. **That is a
one-off.** Once B1 ships the KPI views, they are the sanctioned definitions and
this agent uses them — a metric recomputed inline disagrees with the dashboard
within a month, and then nobody knows which number is real.
