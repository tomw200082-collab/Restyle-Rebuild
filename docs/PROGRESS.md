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
