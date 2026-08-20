# PROGRESS

One entry per phase: what was done, deviations from the master prompt, known gaps.

---

## Phase 0 — Deep understanding ✅

**Done**
- Confirmed repo state: single `README.md` on an initial commit. No `/legacy`, no `/legacy-data`.
- Environment recon: Node 22.22, npm 10.9, PostgreSQL 16.13 (local, started), PostgREST 12.2.3 (downloaded), no Docker daemon, GitHub releases reachable, npm registry reachable.
- **Egress finding:** the session's proxy denies CONNECT to `vntihvctqueohwprafwh.supabase.co:443` (403, policy denial). The remote Supabase project is reachable **only** via the Supabase MCP tools, not from application code running in this sandbox. See `[D-26]` and §"Infrastructure substitution" below.
- Wrote `docs/ANALYSIS.md`, `docs/DECISIONS.md`, `docs/COPY.md`, this file.
- **`docs/LEGACY_INTELLIGENCE.md` arrived mid-phase and was saved verbatim**, then ANALYSIS.md was rewritten (revision 2) and 13 reconciliation decisions (`D-31`…`D-43`) appended to DECISIONS.md, per master prompt §2.

**Findings that changed the plan**
1. The legacy app is **request-first with manual phone payment**, not an on-platform-payment marketplace. v2 inverts this.
2. **72% of all legacy orders (68/94) died waiting for seller confirmation.** One order completed in five months. This is the business's central failure mode and now drives KPI and reminder decisions (`[D-43]`).
3. **Pricing model is inverted** — legacy sellers name a *net* price with a 12% markup added; v2 sellers name a *gross* price with 20% deducted. Consequences and mitigations in ANALYSIS §7 C-1, `[D-35]`, `[D-36]`.
4. **v2's flat zone delivery fees appear to sit below cost** on a catalogue that is 60% tier-4 sofas. Built as specified, but instrumented so the gap is visible (`[D-37]`, ANALYSIS §7 C-2).
5. The business already runs on **Sumit**, not PayPlus. Both adapters will be built (`[D-38]`).
6. Legacy has **no RLS at all** — every authenticated user could read every order and every seller's home address. RLS verification is a Gate 1 blocker (`[D-31]`).
7. Legal/marketing copy is available verbatim and is reused, with **three factual corrections** (`[D-39]`).

**Deviations from the master prompt**
- None yet. Three conflicts between the master prompt and ground truth were resolved in the master prompt's favour and recorded (ANALYSIS §7 C-1, C-2, C-3); one addition (a Sumit adapter alongside the specified PayPlus one) is additive, not a substitution.

**Known gaps**
- No `/legacy-data`, so `scripts/import-legacy.ts` (Phase 5) will be written and unit-tested but not executed against real rows.

---

## Infrastructure substitution (applies to the whole run)

Per master prompt §9, documented here rather than left implicit.

| Concern | Production (Tom's environment) | This sandbox |
|---|---|---|
| Database | Supabase project `vntihvctqueohwprafwh` (eu-central-1) | Local PostgreSQL 16 |
| Schema | Applied via the Supabase MCP `apply_migration` | Same migration files applied to local PG |
| REST API | Supabase PostgREST | **Real PostgREST 12.2.3** against local PG — same wire protocol, same RLS enforcement |
| Auth | Supabase Auth (Google OAuth + email OTP) | Minimal GoTrue-compatible shim issuing the same HS256 claims (`sub`, `role`, `email`, `aud`, `exp`) |
| Storage | Supabase Storage bucket `listing-photos` | Local file-backed storage shim on the same `/storage/v1` paths |

Why this shape: using the **real** PostgREST binary means RLS is genuinely enforced end-to-end in tests rather than simulated — and RLS is the defect class that actually matters here, given the legacy app had none. Application code uses `@supabase/supabase-js` unchanged in both environments; only `NEXT_PUBLIC_SUPABASE_URL` differs. `docs/POST_RUN_HOOKUP.md` will carry the exact commands to point everything at the remote project.

---

## Phase 1 — Foundation ✅

**Done**
- Next.js 16.3 + React 19.2 + TypeScript (strict, `noUncheckedIndexedAccess`) + Tailwind 4 + App Router.
- Design tokens as Tailwind 4 `@theme` variables, mirrored from the design-system skill's `references/tokens.css`.
- Fonts: Frank Ruhl Libre (display) + Heebo (body), Hebrew subsets, `next/font`.
- `<html lang="he" dir="rtl">`; logical properties throughout; `.ltr-isolate` utility for embedded LTR runs.
- **16 migrations**, applied to both the local database and the remote Supabase project (`vntihvctqueohwprafwh`).
- RLS on all 19 tables. **Supabase security advisor: 0 issues.**
- `db/seed.ts` — idempotent, deterministic: 12 categories, 12 brands, 20 delivery zones, 4 users, 40 listings (30 active + 2 in each non-active status), 120 locally-generated placeholder photos, 5 legacy redirects keyed on real legacy ids.
- `db/rls_test.sql` — both-direction assertions per policy, plus money invariants, append-only audit, and state-machine legality.
- Auth: email+password, email OTP, Google OAuth; profile trigger; admin bootstrap from `ADMIN_EMAIL`.
- Layout: sticky header with category nav, mobile drawer, footer with legal links.
- Playwright multi-actor harness (anon/buyer/seller/admin storage states) + Gate 1 specs.

**Gate 1 — all green**
| Check | Result |
|---|---|
| `npm run build` | ✅ `/` static with 1h ISR |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ 0 problems |
| `npm run test` (Vitest) | ✅ 16 slug tests |
| `db/rls_test.sql` | ✅ all assertions |
| Seed idempotency | ✅ identical counts on re-run |
| Auth round trip (e2e) | ✅ 7 Playwright tests |

**Three defects found and fixed during this phase** — all three were live in the schema before being caught:

1. **Every `SECURITY DEFINER` function was an anonymous RPC endpoint.** Supabase publishes everything in `public` at `/rest/v1/rpc/*` and Postgres grants EXECUTE to PUBLIC by default, so `transition_order` and `create_order` were callable without signing in — anyone could have moved any order to `completed` or minted an order at a zero price. Found by Supabase's security advisor. → `[D-44]`, migrations 0014–0015.
2. **`pickup_street` was never actually protected**, and worse than assumed: a column-level `revoke` is inert on top of a table-level grant, and the grant covered `authenticated` — so **any signed-in user could read every seller's home address**. Found by writing the RLS assertion for `authenticated` rather than only for `anon`. → `[D-45]`, migration 0016.
3. **The whole site rendered dynamically.** A session-aware header in the root layout, plus supabase-js's `no-store` default fetch, each independently opt every route out of static generation — which would have quietly deleted the ISR strategy the SEO plan depends on. Found by reading the build output. → `[D-46]`.

**Deviations from the master prompt**
- Next 16 rather than 15 (spec says "15+"); TypeScript 6 rather than 7 (npm's peer resolution chose it, and it avoids depending on the compiler rewrite).
- `npm run lint` runs ESLint directly — `next lint` was removed in Next 16.

**Known gaps carried forward**
- Google OAuth is configured but not exercised locally (no provider in the local stack) — `[D-30]`.
- Email OTP needs a real mail provider; local sign-in is email+password.

---

## Phase 2 — Marketplace core ✅

**Done**
- **Fee engine** (`src/lib/pricing/engine.ts`) — pure, no I/O, single source of truth for money. 20 unit cases cover zone selection and the cross-zone "higher zone wins" rule, the per-side floor surcharge, self-pickup, commission rounding, and the two invariants the database also enforces.
- **Catalog** — SSR, filters as URL state, validated params, pagination, empty state with a way out.
- **Item page** — gallery, specs, price with original-price strikethrough, live delivery estimator, favourites, seller card (first name + initial, city only), similar items. Sold items stay at 200 with no purchase path.
- **Delivery estimator** imports the *same* pure fee function into the browser — no round trip, no second implementation to drift from the server's.
- **Category and brand hubs**, with `noindex` below 3 items on brand pages.
- **Sell wizard** — photos-first, client-side compression, AI draft, five steps, review, submit into `pending_review`.
- **AI provider** — `AiListingProvider` interface, deterministic mock (the default) and an Anthropic vision implementation.
- **Cache invalidation** centralised for Next 16's split API (`updateTag` in server actions, `revalidateTag(tag, profile)` elsewhere).

**Gate 2 — all green**
| Check | Result |
|---|---|
| Build / typecheck / lint | ✅ |
| Vitest | ✅ 36 tests (16 slug + 20 pricing) |
| RLS assertions | ✅ |
| Playwright | ✅ 20 tests across anon / buyer / seller |

**Four defects found while building and testing this phase**

1. **Embedded selects were untyped.** The type generator emitted empty `Relationships`, so every `listings(*, listing_photos(*))` type-checked as `SelectQueryError`. Fixed by introspecting foreign keys.
2. **A failed photo upload rendered nothing.** `formError` was only shown on the review step, so a seller whose upload failed saw a disabled Continue button and no explanation. Now reported per file, distinguishing an undecodable file (retrying will never help) from a failed upload (retrying might).
3. **Submit validation was unactionable.** It said "יש שדות שצריך לתקן" without saying which field. The review step now lists each error with a control that jumps to the step that owns it.
4. **Every browser-uploaded image was silently corrupt.** supabase-js uploads as `multipart/form-data` from the browser, and the local storage shim was writing the whole MIME envelope to disk. Node-uploaded seed images masked it because they take a different path. The e2e now asserts WebP magic bytes on the stored object.

**Also hardened:** `db/rls_test.sql` no longer hardcodes row counts — the e2e suite creates real listings, and literal counts made the RLS suite fail for reasons unrelated to RLS. Expected counts are captured as the table owner before switching roles, with a guard that the fixture actually contains something the role shouldn't see.

**Known gaps carried forward**
- Buy and offer CTAs link to `/checkout/new` and `/item/[slug]/offer`, both built in Phase 3.
- `generateStaticParams` for item/category/brand pages comes in Phase 5.

---

## Phase 3 — Transactions ✅

**Done**
- **PaymentProvider** interface with three implementations: `MockPaymentProvider` (default), a `PayPlusProvider` skeleton as specified, and a `SumitProvider` skeleton for the PSP the business already runs on `[D-38]`. The mock is not a shortcut — it redirects to a real page, which posts a signed callback to the real webhook, whose signature is really verified.
- **Checkout** — delivery vs self-pickup, live pricing from the shared engine, server-side re-computation that never trusts the client total `[D-19]`, and atomic order creation that reserves the listing in the same statement `[LI 4]`.
- **Payment webhook** — signature-verified, idempotent (a repeat capture is a no-op), and it refuses a capture whose amount disagrees with the order rather than guessing.
- **Offers** — submit, accept, decline, one counter round, buyer-accepts-counter, 72h expiry, 24h exclusive checkout. The listing stays purchasable at full price throughout `[D-15]`.
- **Order lifecycle** — seller confirmation with proposed pickup windows, buyer cancellation with the published ₪50 post-confirmation fee `[D-40]`, refunds through the provider interface.
- **Scheduling rules** carried over from the legacy platform: shifts, no Saturdays, Friday mornings only, tomorrow-earliest, ≤90 days `[D-32]` — 14 unit tests.
- **Six cron jobs**, all deriving timing from stored timestamps and all idempotent: seller-timeout, seller-reminder, abandoned-checkout, offer-expiry, protection-window, listing-expiry. Guarded by a constant-time `CRON_SECRET` check. `vercel.json` carries the schedules.
- **NotificationProvider** — mock (default) and Resend, with Hebrew templates reusing legacy subject lines verbatim and rewriting the bodies the new flow makes false (the old "לא חויבת ולא נגבה ממך כסף" cannot be sent by a platform that charges at checkout).
- **Buyer and seller dashboards** — orders, offers, favourites, listings, sales, payouts, plus per-order pages with the `order_events` timeline.

**Gate 3 — all green**
| Check | Result |
|---|---|
| Build / typecheck / lint | ✅ |
| Vitest | ✅ 54 tests (slug, pricing, scheduling) |
| RLS assertions | ✅ |
| Playwright | ✅ 30 tests across anon / buyer / seller |

**Two defects found while testing this phase**

1. **Every embedded `orders → listings` select silently returned nothing.** `orders.listing_id → listings.id` and `listings.resale_source_order_id → orders.id` both exist, so PostgREST refused to guess which relationship to use. It surfaces as an empty result rather than a thrown error when you only destructure `data`, which looks exactly like RLS hiding the row — the mock payment page 404'd and the cause looked like an auth problem for several rounds. Fixed by naming the FK (`listings!orders_listing_id_fkey`), and the skill now says to always destructure `error` on an embedded select.
2. **An offer test depended on "the first card" on a shared dashboard.** It passed alone and failed in the full parallel run. Now targeted by the fixture listing's unique title.

**Also improved:** `createServerSupabase()` is now `cache()`d, so a request builds one client and parses the cookie jar once instead of doing it per helper.

**Known gaps carried forward**
- Admin scheduling, delivery manifest, payouts ledger UI, disputes console → Phase 4.
- `picked_up` / `delivered` transitions are admin actions, built in Phase 4; the protection-window job that consumes `delivered` already exists and is tested at the unit level.

---

## Phase 4 — Ops cockpit + notifications ✅

Skills read at phase start: `marketplace-db`, `restyle-design-system`, `hebrew-rtl-ui`, `restyle-e2e`.

The admin surfaces are where the AptDeco model stops being a diagram and becomes a job someone does on a Tuesday morning. Every screen here exists because a real operational step needs it, and the density is deliberately higher than the storefront's — same tokens, more rows per screen `[design-system §Layout]`.

**Built**

- **Role-gated admin layout** — `requireAdmin()` at the layout, RLS as the backstop `[D-28]`, plus its own nav. Not reachable by URL guessing.
- **KPI dashboard** — GMV, take rate, order counts by status, and two KPIs promoted to first-class because the legacy audit says they decide the business: **seller-confirmation rate / time-to-confirm** `[D-43]` (72% of legacy orders died here) and **delivery margin** `[D-37]` (charged zone fee vs. actual crew cost).
- **Review queue** — the full submitted listing, seller contact, photos, and one-click approve / reject-with-reason. Approving publishes and notifies; rejecting notifies with the reason.
- **Orders kanban** — every live order by status, oldest first, because the oldest is the one about to breach a window.
- **Order detail** — the operational spine: schedule pickup and dropoff (shift-aware, honouring the Friday/Saturday rules `[D-32]`), record pickup, record delivery, fail an inspection, cancel, refund. Every action writes to `order_events`.
- **Deliveries day view** — one date, both legs, with a copyable plain-text **crew manifest**. WhatsApp integration is out of scope, so the deliverable is text a human pastes — which is what the ops flow actually needs today. Each stop names its crew, because the day spans every crew working it.
- **Payouts ledger** — pending total, per-seller rows, mark-paid with a transfer note. Payouts are created by the protection-window job, not by hand.
- **Disputes console** — full refund, partial refund, or reject with a written resolution; the buyer-side dispute form feeds it.
- **Config and zone editors** — commission, windows, fees, floor surcharges and delivery zones are all rows, not constants `[D-40]`.
- **Notifications wired to every transition** — sixteen Hebrew templates, each fired from the action or job that owns the state change, each idempotent by key.

**Gate 4 — all green**
| Check | Result |
|---|---|
| Build / typecheck / lint | ✅ |
| Vitest | ✅ 54 tests |
| RLS assertions | ✅ |
| Playwright | ✅ 32 tests across anon / buyer / seller / admin |
| Full lifecycle e2e | ✅ approve → buy → confirm → schedule → picked_up → delivered → completed → payout pending → paid, all nine transitions asserted in `order_events` |

**Four defects found while testing this phase**

1. **The review queue rendered empty against a database that plainly had rows.** Migrations 0017/0018 added the `profiles` foreign keys, but **PostgREST caches the schema at start-up** and only refreshes on `notify pgrst, 'reload schema'`. Until it does, an embed naming a new FK hint returns `PGRST200`, which — with the error dropped — is indistinguishable from an empty table. `scripts/db-migrate.ts` now issues the notify on every run, including no-ops. Supabase-hosted projects reload on DDL automatically, which is exactly why this only bites locally, i.e. in the tests.
2. **Thirty-one queries were discarding their `error`.** Same root cause as the defect above and as one in Phase 3, so it was fixed as a class rather than a case: every read now throws `[D-47]`. The dangerous instances were in the cron jobs, where a failed query means the job reports success having processed nothing — how the legacy reservation cleaner died quietly for months.
3. **A seller whose sale was auto-cancelled was told nothing.** The `seller_timeout_cancelled` template existed and had no call site; only the buyer heard. Given that seller non-response is the business's central failure mode, this was the one notification most worth having. Now sent, keyed idempotently per side.
4. **Two tests encoded assumptions the product doesn't hold** `[D-48]`: a locator filtering on `"₪800"` (ICU emits `‏800 ‏₪` — trailing symbol, nbsp, two RLM marks, so it could never match) and a hardcoded `'evening'` shift that is unavailable on Fridays. Both now key off stable attributes and live options.

**Also improved:** `send()` on the notification provider is now a non-throwing boundary — a broken email cannot make a completed payout report as failed `[D-47]`.

---

## Phase 5 — SEO layer + migration ✅

Skills read at phase start: `nextjs-seo-engine`, `hebrew-rtl-ui`, `restyle-design-system`, `restyle-e2e`.

Organic search is the growth thesis. The system being replaced was a client-rendered SPA whose every item lived at `ItemDetails?id=<24-hex>` — no slug, no server HTML, no structured data, and no category, brand or city pages at all. This phase converts that into indexable surface area, and moves the accumulated authority across rather than abandoning it.

**Built**

- **Sitemap** — an index at `/sitemap.xml` plus chunks at `/sitemap/<n>.xml`, split at 45,000 URLs. Written as route handlers, not the `sitemap.ts` convention, which has no index form and leaves `/sitemap.xml` 404ing `[D-49]`. Carries every `active` and `sold` item, all categories, qualifying brand and category×city hubs, and the static pages.
- **robots.txt** — disallows `/admin`, `/dashboard`, `/checkout`, `/pay`, `/api`, `/login`, `/auth`; points at the sitemap.
- **Structured data** — `Product` (ILS, decimal-string price, `UsedCondition`, `SoldOut` when sold) and `BreadcrumbList` on item pages; `BreadcrumbList` + `ItemList` on hubs; `Organization` + `WebSite` with `SearchAction` once at the root; `FAQPage` on how-it-works carrying **both** tracks' questions, since a crawler should see everything on the URL even though the page shows one track at a time.
- **`/category/[slug]/[city]`** — programmatic hubs, pre-rendered for the pairs that clear the item threshold, `noindex` below it, and linked from the parent category page so they are not orphans in the internal graph.
- **`generateStaticParams`** on items (active only — sold items stay indexable but render on demand), categories and brands.
- **Dynamic OG images** — `/item/[slug]/opengraph-image` composes photo, title and price at 1200×630.
- **Catalogue canonical policy** moved into `generateMetadata`: a single category or brand filter canonicalises onto its hub, a hubless filter back to `/catalog`, and two or more facets go `noindex, nofollow`.
- **Legacy redirects** — 301s in middleware for every path that appears in already-sent email, matched case-insensitively because React Router was and both casings are in the wild `[D-42]`. Item and order ids resolve through `legacy_redirects`; anything unmapped lands on the catalogue, never a 404.
- **`scripts/import-legacy.ts`** — idempotent, keyed on legacy ids, `--dry` runs the real SQL inside a transaction and rolls back. Uses `display_price` (what the buyer saw), not `requested_price` (the seller's net) `[D-35]`. Rows missing a category or dimensions are imported as `draft` rather than dropped, so the redirect survives and the gap is visible in the admin. Historical orders are archived, not replayed — their state machine no longer exists.
- **`scripts/validate-jsonld.ts`** — parses every `ld+json` block on the running site and asserts the fields that decide rich results. Broken structured data fails silently in production otherwise.
- **Content pages** — terms, privacy, cancellation policy, accessibility statement, how it works, buyer protection. Hebrew reproduced from the legacy platform with exactly the three corrections in `[D-39]`, each of which would otherwise publish a false statement about the buyer's rights or about who receives their data.
- **`npm run db:reset`** `[D-52]`, and a favicon set.

**Gate 5 — all green**
| Check | Result |
|---|---|
| Build / typecheck / lint | ✅ |
| Vitest | ✅ 77 tests (slug, pricing, scheduling, SEO) |
| RLS assertions | ✅ |
| Playwright | ✅ 55 tests across anon / buyer / seller / admin |
| `scripts/validate-jsonld.ts` | ✅ |

**Lighthouse (mobile, local production build)**
| Page | Perf | SEO | A11y | Best practices |
|---|---|---|---|---|
| `/` | 99 | 100 | 100 | 96 |
| `/item/[slug]` | 98 | 100 | 100 | 96 |
| `/category/sofas-armchairs` | 100 | 100 | 100 | 96 |

The remaining 4 points on best practices were a missing `/favicon.ico`, now added.

**Four defects found while testing this phase**

1. **`/sitemap.xml` returned a 404** `[D-49]`. Adding `generateSitemaps` relocates the output to `/sitemap/<id>.xml` and publishes no index — so the one URL robots.txt points at, and every crawler tries first, was missing. Nothing in the application requests it, so nothing would ever have noticed.
2. **Every primary and danger button rendered ink text on clay instead of white** `[D-51]`. `tailwind-merge` classified the custom `text-body-sm` font-size utility as a colour and dropped `text-white` from the merge. It had been wrong since Phase 1, in the most-clicked element in the product, and was invisible because dark-on-clay is legible enough not to look broken. A contrast audit found it.
3. **Five palette tokens failed WCAG AA** `[D-50]`, including the accent on both of the two things it exists for: the price (3.78:1) and the primary CTA (4.04:1). Corrected by uniform darkening, which preserves hue exactly. Item-page accessibility went 85 → 100.
4. **The gallery's `role="tablist"` was ARIA promising a relationship the markup did not have** — no tabpanel, no `aria-controls` — and it destroyed the list semantics of the `ul`/`li` it sat on, so the thumbnails were simultaneously not-tabs and not-a-list. Replaced with a plain list and `aria-current`.

**Also found:** `next build` reuses `.next/cache/fetch-cache`, so a build straight after a data reset prerenders the previous catalogue — pages for listings that no longer exist, with 404ing images — and reports success `[D-52]`.

---

## Phase 6 — Hardening + handoff ✅

Skills read at phase start: all five.

**Built**

- **Rate limiting** `[D-53]` — counted in Postgres, because a per-process counter on serverless functions resets on every cold start and limits almost nothing. Applied to the AI draft call, offers, disputes, listing submission and checkout. Fails open and logs, because a limiter that takes checkout down when the database hiccups has done more damage than the abuse. A daily housekeeping job prunes the window table.
- **Security headers** `[D-54]` — CSP, HSTS, and the existing nosniff/frame/referrer/permissions set. The CSP is deliberately not nonce-based: a nonce forces every page dynamic and would delete the ISR the SEO strategy depends on, so it locks down everything that does not need one.
- **Open-redirect guard tightened** — the auth callback normalises backslashes before checking for an off-site target, because browsers read `/\evil.example` as `//evil.example`.
- **Hebrew 404, error and global-error pages**, and loading skeletons on the three routes that can safely have them `[D-55]`.
- **Email log** at `/admin/notifications` — the legacy platform accumulated 51 silent delivery failures across three tables and nobody knew. The runbook sends the operator here first.
- **Optional analytics**, off by default, and deliberately not pre-authorised in the CSP.
- **Handoff docs** — `README.md`, `docs/RUNBOOK.md` (Hebrew), `docs/DEPLOYMENT.md`, `docs/POST_RUN_HOOKUP.md`, `docs/FINAL_REPORT.md`.

**Gate 6 — all green**
| Check | Result |
|---|---|
| Build / typecheck / lint | ✅ |
| Vitest | ✅ 77 tests |
| RLS assertions | ✅ |
| Playwright | ✅ 68 tests across anon / buyer / seller / admin |
| `scripts/validate-jsonld.ts` | ✅ |
| Supabase security advisor | ✅ 0 warnings (3 INFO, all deliberate deny-all tables) |

**Clean-clone verification** — a fresh `git clone` of this branch, with only `.env.local` supplied:

| Step | Result |
|---|---|
| `npm install` | ✅ 504 packages, 0 vulnerabilities |
| `npm run db:migrate` against an empty database | ✅ 20 migrations applied from zero |
| `npm run db:seed` | ✅ 30 active listings, 120 photos |
| `npx tsc --noEmit` / `eslint .` | ✅ clean |
| `npm test` | ✅ 77 |
| `npm run build` | ✅ |
| `npm run db:rlstest` | ✅ |
| `npm run test:e2e` | ✅ 68 |
| `npm run seo:validate` | ✅ |

No secret is present in the clone: it contains `.env.example` and nothing else env-shaped.

**Three defects found while testing this phase**

1. **Adding `loading.tsx` turned four routes into soft 404s** `[D-55]`. A route-level loading file opens a Suspense boundary, Next begins streaming, the status commits to 200, and `notFound()` can then only add a meta tag. `/item`, `/category`, `/category/city` and `/brand` all returned 200 for unknown slugs — a page that renders correctly, reports success, and gets indexed as real content. Caught by asserting on status codes rather than on rendered text.
2. **`upgrade-insecure-requests` broke sign-in and favourites** `[D-54]`. Keyed on `NODE_ENV`, which `next start` sets to production locally too, it rewrote every call to the http local Supabase into https. The e2e suite caught it; a developer running `next start` would have seen the same thing and had no idea why.
3. **A payout assertion was a latent race.** Once `paid_at` is set the row reads "שולם" in both the badge and the metadata line, so matching the word was a race between two correct renderings. Now asserted on the row's `data-status`.

**Also found:** the seed and the migration runner can target different databases without complaint when the local stack's gateway and `DATABASE_URL` diverge. The seed's own photo-count self-check caught it immediately, which is what that check is for.

**RLS performance** `[D-56]` — running Supabase's *performance* advisor (not just the security one) surfaced 31 warnings, every one of them on the product's hottest read path: a bare `auth.uid()` in a policy is re-evaluated per row, and a user-facing SELECT policy alongside an admin `for all` policy makes Postgres evaluate both for every row. Migrations 0021 and 0022 fix both, and `db/rls_test.sql` proves the permission set is unchanged.

| Advisor | Before | After |
|---|---|---|
| `auth_rls_initplan` | 15 WARN | 0 |
| `multiple_permissive_policies` | 16 WARN | 0 |
| security | 0 WARN | 0 WARN (3 INFO, deliberate deny-all tables) |

**Rate limits and the shared test accounts.** The suite runs as three fixture accounts, so the buyer alone completed 47 checkouts against a limit of 30 an hour and the lifecycle test hung waiting for a redirect that a rate-limited action never produced. The limit is right for a real person; the fixture accounts are what is unrealistic, so the Playwright setup truncates `rate_limits` — same reasoning as `db:reset`.
