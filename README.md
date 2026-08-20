# Restyle

A curated marketplace for second-hand furniture in Gush Dan. Sellers list for
free; Restyle photographs the item's story into a listing, finds the buyer,
takes payment, collects from the seller's home, inspects, delivers to the
buyer's home, and pays the seller after delivery. **Buyer and seller never
meet.**

The product is Hebrew and right-to-left. The code, comments, commits and docs
are English.

- **Stack** — Next.js 16 (App Router, RSC), TypeScript strict, Tailwind 4,
  Supabase (Postgres, Auth, Storage, RLS), Vercel.
- **Money** — integers, in agorot, everywhere. A shekel float never exists.
- **Third parties** — payments, email and AI each sit behind an interface with
  a mock implementation, and **mock is the default**. The whole product,
  including a complete purchase, runs and is tested with no API keys at all.

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in Supabase URL + keys, set CRON_SECRET
npm run db:migrate                # apply supabase/migrations in order
npm run db:seed                   # 40 listings, 3 accounts, generated photos
npm run dev                       # http://localhost:3000
```

Seeded accounts (password `restyle-dev`):

| Account | Role |
|---|---|
| `admin@restyle.test` | admin — the ops cockpit at `/admin` |
| `seller@restyle.test` | a seller with live listings |
| `buyer@restyle.test` | a buyer with orders and favourites |

With `PAYMENT_PROVIDER=mock` (the default) checkout goes to a local fake PSP at
`/pay/mock/[orderId]` with a success and a cancel button, so the full lifecycle
is exercisable in a browser without any payment credentials.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build and serve |
| `npm run verify` | typecheck + lint + unit tests + RLS assertions |
| `npm run verify:all` | the above, plus build, e2e and structured-data checks |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright, four actor projects |
| `npm run db:migrate` | apply migrations (idempotent) |
| `npm run db:seed` | seed (idempotent) |
| `npm run db:reset` | **destroys all data**, re-seeds, clears the Next fetch cache — local only |
| `npm run db:rlstest` | asserts every RLS policy in both directions |
| `npm run db:types` | regenerate `src/types/database.ts` from the live schema |
| `npm run seo:validate` | parse and assert every JSON-LD block on a running site |
| `npm run import:legacy -- --dir ./legacy-data --dry` | import a Base44 export |

## Layout

```
src/
  app/                 routes; RSC by default, 'use client' only where needed
  components/          ui/ primitives, then feature folders
  lib/
    actions/           server actions — the only mutation entry points
    db/                query modules; safe projections live here, never inline
    pricing/           the fee engine, pure and shared browser ↔ server
    payments/          PaymentProvider: mock | payplus | sumit
    notifications/     NotificationProvider: mock | resend, Hebrew templates
    ai/                AiListingProvider: mock | anthropic
    seo/               slugs, JSON-LD, sitemap sources, legacy route map
    jobs/              the seven cron jobs, all idempotent
supabase/migrations/   numbered SQL; the schema's only source of truth
db/                    seed data and the RLS assertion suite
docs/                  analysis, decisions, progress, runbook, deployment
.claude/skills/        the five project skills
```

## The rules that matter

Read `docs/DECISIONS.md` before changing any of these — each entry says what was
decided, why, and what was rejected.

1. **Money is `bigint` agorot**, with database CHECK constraints enforcing that
   commission + payout = item price and that the total balances. `[D-01]`
2. **Order state changes go through `transition_order()`**, a SQL function with
   a transition table and a row lock. There is no `UPDATE orders SET status`
   anywhere in the application. `[D-04]`
3. **`order_events` is append-only**, enforced by revoked privileges and a
   trigger — not by convention. `[D-05]`
4. **The seller's street address is readable by `service_role` only**, via
   column privileges. RLS is row-level and structurally cannot protect a
   column. `[D-06]`, `[D-45]`
5. **Every Supabase read destructures `error` and throws it.** Dropping it turns
   an API failure into an empty list, which is a plausible-looking UI state.
   `[D-47]`
6. **Server actions check authorization explicitly; RLS is the backstop**, not
   the only check. `[D-28]`
7. **Public pages read through a cookie-free anonymous client** so they stay
   statically renderable. Any component reading cookies makes its whole route
   dynamic. `[D-46]`

## Documentation

| File | For |
|---|---|
| `docs/ANALYSIS.md` | what the legacy system actually was, and the gaps |
| `docs/DECISIONS.md` | every judgement call, with the rejected alternatives |
| `docs/PROGRESS.md` | phase-by-phase record, including defects found |
| `docs/RUNBOOK.md` | **Hebrew** — the daily operational guide |
| `docs/DEPLOYMENT.md` | going live on Vercel + Supabase |
| `docs/POST_RUN_HOOKUP.md` | pointing this at the real Supabase project |
| `docs/LEGACY_INTELLIGENCE.md` | the forensic audit of the old platform |
| `docs/COPY.md` | Hebrew copy, with provenance for every string |
