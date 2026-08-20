# ANALYSIS — Restyle v2 rebuild

_Phase 0 deliverable. **Revision 2** — reconciled against `docs/LEGACY_INTELLIGENCE.md` (authoritative ground truth), which arrived mid-run. Revision 1 was written from the master prompt alone; every inference it made that ground truth contradicted has been corrected here, and the corrections are itemised in §7._

---

## 0. Source material availability

| Expected input | Present? | Consequence |
|---|---|---|
| `/legacy` (Base44 React/Vite export) | NO | No source to read directly. |
| `/legacy-data` (CSV exports) | NO | `scripts/import-legacy.ts` is written in Phase 5 and left awaiting data. |
| `docs/LEGACY_INTELLIGENCE.md` | **YES** | **Authoritative.** A forensic read-only audit of the live Base44 app produced by the legacy platform's own agent: entity schemas, live-data statistics, backend function sources, integration wiring, URL formats, and verbatim legal/marketing copy. Per master prompt §2 it **overrides anything inferred from code or from this document's first revision.** |

The repository at run start contained one file (`README.md`, 17 bytes). This is a greenfield rebuild informed by a detailed audit of the system being replaced.

**Reading rule for the rest of this document:** facts sourced from LEGACY_INTELLIGENCE.md are ground truth and cited as `[LI §n]`. Facts sourced from the master prompt are the *specification for v2* and cited as `[MP §n]`. Where they conflict, the master prompt wins (it is the newer product decision) — but every such conflict is recorded in §7 with its business consequence, because several of them change what Tom's business actually earns per order.

---

## 1. What the legacy system actually is

This is the single most important correction to revision 1, which assumed the legacy app already worked like AptDeco. It does not.

**The legacy model is "request-first" with manual phone payment** `[LI §0]`:
1. Buyer submits a *purchase request* with two proposed delivery windows. **No money is taken.**
2. Ops (Tom) phones the seller to confirm availability.
3. Ops phones the buyer to collect payment manually.
4. Delivery is coordinated; payout released after delivery.

The consequences of that design are visible in the data and they are brutal:

> **68 of 94 orders (72%) ended in `cancelled_due_to_inactivity`** `[LI §2]` — the seller never responded in time. Exactly **one** order completed end-to-end in five months of operation.

That single statistic is the strongest signal in the entire audit, and it validates the v2 direction: the funnel does not leak at discovery or at checkout, it leaks at **seller confirmation**. Every design choice in v2 that reduces seller-response friction or reduces the cost of a seller not responding is aimed directly at the number that killed the pilot.

**v2 inverts the model** to the AptDeco pattern specified in `[MP §3]`: the buyer pays on-platform at checkout, the listing reserves immediately, and a non-responsive seller costs the buyer nothing because the 48h timeout auto-refunds. The seller-confirmation step still exists — it is inherent to a consignment-free marketplace — but it no longer sits between the buyer and their wallet, and a stalled seller no longer silently destroys demand.

**Instrumentation requirement carried into Phase 4:** seller-confirmation rate and time-to-confirm are the KPIs that matter most for this business. The admin KPI dashboard must surface them, not just GMV.

---

## 2. Route inventory — legacy → v2

Legacy routing `[LI §6]`: a Base44 SPA. One route per page at `/<PageName>` (PascalCase), matched **case-insensitively** by React Router, with the app's own helper generating lowercase paths — so `/ItemDetails` and `/itemdetails` both resolve. Entity identity is passed as a query param. **Legacy record ids are 24-character hex strings** (Mongo ObjectId shape), *not* uuids — this directly determines the `legacy_redirects` key type and the middleware's match pattern.

Canonical legacy item URL: `https://restyle.co.il/ItemDetails?id=<24-hex>`

Legend: `port` = same job, rebuilt · `split` · `merge` · `deprecate`.

### 2.1 Public / catalog

| Legacy route | v2 route | Status | Notes |
|---|---|---|---|
| `/` (Home) | `/` | port | |
| `/Catalog` (`?category=`, `?search=`) | `/catalog` | port | Legacy filtered client-side over a fetched array and used **substring matching to paper over the כסא/כיסא spelling split** `[LI §8.20]`. v2 filters server-side against a real `categories` table, which removes the class of bug entirely. |
| `/ItemDetails?id=<24-hex>` | `/item/[slug]` | port | **The SEO page.** 301 via `legacy_redirects`. |
| `/About` | `/how-it-works` | merge | Thin page; its content belongs in the how-it-works narrative. |
| `/Favorites` | `/dashboard/buyer` (favorites tab) | merge | 1 favourite in five months `[LI §2]` — not a destination. |
| — | `/category/[slug]`, `/category/[slug]/[city]`, `/brand/[slug]` | new | Programmatic SEO. None existed. |

### 2.2 Selling

| Legacy route | v2 route | Status | Notes |
|---|---|---|---|
| `/UploadItem` (`?reuploadId=`) | `/sell/new` | port | The `reuploadId` flow (re-submit a rejected listing) is real and worth keeping — 49 `SELLER_REJECTED` emails were sent `[LI §2]`, so rejection-and-resubmit is a well-travelled path, not an edge case. v2 keeps it as `/sell/new?from=<listingId>`. |
| `/UploadSuccess` | `/sell/new` success step | merge | Wizard step, not a route. |
| `/VerifyEmail` | — | deprecate | Legacy sent a bespoke seller email-verification (38 sent). Supabase Auth verifies email natively; a second verification layer is redundant. |
| `/SellerDashboard` | `/dashboard/seller` | port | |
| `/SellerAnswer` | — | deferred | Part of the Q&A feature (see §5, G-13). |
| — | `/sell` | new | Seller landing + fee calculator. Legacy had no seller-acquisition surface. |

### 2.3 Checkout / order

| Legacy route | v2 route | Status | Notes |
|---|---|---|---|
| `/Checkout?id=<itemId>` | `/checkout/[orderId]` | port + **rekey** | Legacy keyed checkout by *item*; v2 keys by a persisted `orders` row, so a refresh or lost tab cannot lose the transaction. |
| `/CheckoutDetails`, `/PaymentSuccess`, `/PaymentCancelled`, `/ScheduleDelivery` | — | deprecate | Explicitly marked legacy/abandoned in the audit `[LI §6]`. Still 301-redirected because they may exist in old emails. |
| `/OrderSuccess?orderId=` | `/checkout/[orderId]/success` | port | |
| `/OrderDetails` | `/dashboard/buyer/orders/[id]` | port | |
| `/OpenDispute` | `/dashboard/buyer/orders/[id]/dispute` | port | |
| `/BuyerDashboard` | `/dashboard/buyer` | port | |
| `/SellerResponse?orderId=&windowId=&option=&action=` | `/dashboard/seller/orders/[id]` | port + **auth-gate** | **Security-relevant.** These are one-click, unauthenticated deep links from email that mutate an order (approve/counter a window). Anyone holding the URL can act as the seller. v2 requires an authenticated session; the emailed link becomes a login-then-redirect. See `[D-33]`. |
| `/BuyerResponse?orderId=&windowId=` | `/dashboard/buyer/orders/[id]` | port + auth-gate | as above |
| `/SellerResponseSuccess`, `/BuyerResponseSuccess` | — | deprecate | Confirmation states, not routes. |
| — | `/pay/mock/[orderId]` | new | Local fake-PSP page; makes the purchase path e2e-testable with no keys. |

### 2.4 Content / legal

| Legacy route | v2 route | Status |
|---|---|---|
| `/HowItWorks` | `/how-it-works` | port — copy verbatim `[LI §7.5]` |
| `/BuyerProtection` | `/buyer-protection` | port — copy verbatim `[LI §7.6]`, **with the dispute window corrected 12h → 48h** (see §7 C-4) |
| `/Terms` | `/terms` | port — copy verbatim `[LI §7.1]`, with corrections (§7 C-4, C-5) |
| `/PrivacyPolicy` | `/privacy` | port — copy verbatim `[LI §7.2]`, **with the payment-provider paragraph corrected** (§7 C-5) |
| `/CancellationPolicy` | `/cancellation-policy` | port — copy verbatim `[LI §7.3]` |
| `/Accessibility` | `/accessibility` | port — copy verbatim `[LI §7.4]`; legally required in IL |

Revision 1 wrongly listed `/accessibility` and `/cancellation-policy` as *new* routes that the legacy app lacked. **Both already exist and are published**, with careful Hebrew legal copy naming תום ויט as accessibility coordinator. That copy is reused verbatim.

### 2.5 Admin

Legacy has an **admin UI graveyard** `[LI §8.6]`: `AdminV2` (+`AdminV2Entry`) is live; `Admin`, `AdminDashboard`, `AdminCockpit`, `AdminQuickAccess`, `AdminShippingCoordination`, `AdminSupportRequests` are earlier abandoned generations still routed. `TestItems` is a dev page in production.

| Legacy | v2 | Status |
|---|---|---|
| `/AdminV2?screen=dashboard` | `/admin` | port — KPI dashboard |
| `/AdminV2?screen=review` | `/admin/review` | port — the daily curation loop (113 approve/reject actions in the audit log `[LI §2]`) |
| `/AdminV2?screen=orders` | `/admin/orders` | port |
| `/AdminV2?screen=disputes` | `/admin/disputes` | port |
| `/AdminV2?screen=support` | `/admin/disputes` (+ email) | merge — 3 support requests in five months does not justify a console |
| `/AdminV2?screen=qna` | — | deferred (G-13) |
| `/AdminShippingCoordination?orderId=` | `/admin/deliveries` | port |
| `/Admin`, `/AdminDashboard`, `/AdminCockpit`, `/AdminQuickAccess`, `/AdminSupportRequests`, `/TestItems` | — | **deprecate** — do not recreate |
| — | `/admin/listings`, `/admin/payouts`, `/admin/config` | new |

---

## 3. Data model — legacy reality → v2

Legacy entities `[LI §1]`: `Item`, `Order`, `DeliveryWindow`, `Dispute`, `PromoSubscriber`, `AdminTask`, `EmailEvent`, `FinancialTransaction`, `AuditLog`, `Favorite`, `NotificationLog`, `MoverAssignment`, `Inquiry`, `ItemQuestion`, `SupportRequest`, `User`.

Base44 stamps every entity with `id`, `created_date`, `updated_date`, `created_by` (**the creating user's email**), `created_by_id`.

### 3.1 Entity mapping

| Legacy | v2 | Notes |
|---|---|---|
| `Item` | `listings` + `listing_photos` | `images` array → child table |
| `Order` | `orders` (+ `order_events`) | status vocabulary completely rebuilt (§3.3) |
| `DeliveryWindow` | `deliveries` | Legacy modelled a *negotiation* (rounds, counter-offers, buyer↔seller windows). v2 collapses this: seller proposes, admin schedules `[D-14]`. |
| `MoverAssignment` | `deliveries.crew_*` | 3 records ever; a separate table is unwarranted. |
| `Dispute` | `disputes` | 0 legacy records — design freely. |
| `Favorite` | `favorites` | |
| `User` | `profiles` + `auth.users` | |
| `AuditLog` + `NotificationLog` + `EmailEvent` + `FinancialTransaction` | `order_events` + `outbound_events` | Four overlapping, partly-dead log tables collapse into one append-only order audit plus one outbound-notification log. |
| `AdminTask` | — | Replaced by the admin orders kanban filtered on stuck states. 1 record ever. |
| `Inquiry`, `SupportRequest` | — | 8 records combined; email is the right tool. |
| `ItemQuestion` | — | Deferred (G-13). |
| `PromoSubscriber` | — | Deferred (G-14). |

### 3.2 Field-level corrections confirmed by ground truth

Revision 1 *inferred* several defects. Ground truth **confirms all of them**, which is worth stating plainly because it means the v2 schema decisions were aimed at real problems:

| Inference (rev 1) | Ground truth | Verdict |
|---|---|---|
| User FKs are emails | `Order.seller_id` **holds an email**; `Item.seller_id` is **0% filled**, identity lives in `created_by`/`seller_email` `[LI §8.3]` | **Confirmed** → `[D-22]` |
| No RLS | "No `rls` key exists in any entity file… **there is no row-level isolation anywhere**" `[LI §1]` | **Confirmed, and worse than assumed** → `[D-06]`, `[D-31]` |
| Photos as array | `images: array of string` `[LI §1.1]` | **Confirmed** → `[D-03]` |
| Category as free text | free-text, 5 distinct values, כסא/כיסא split `[LI §2]` | **Confirmed** → `[D-02]` |
| Status enforced in UI only | schema enum ≠ live data; 4 statuses exist only in data `[LI §8.1]` | **Confirmed, emphatically** → `[D-04]` |
| No audit trail | 4 partial log tables, `AuditLog.action` written outside its own enum | **Confirmed** → `[D-05]` |

Two inferences were **wrong**:

- Revision 1 assumed money was stored as float/string. Ground truth shows plain `number` fields (₪ units, e.g. `requested_price: 4500`) — still not integer minor units, so `[D-01]` (agorot) stands, but the import conversion is a clean `×100`, not a string parse.
- Revision 1 assumed `pickup_street` was rendered publicly. Ground truth doesn't confirm public rendering, but shows `exact_address` as a **required** field on `Item` with no RLS at all `[LI §1.1]` — so every authenticated user could read every seller's home address via the SDK regardless of what the UI displayed. The defect is real; the mechanism is worse than assumed.

### 3.3 Status vocabularies

**Legacy `Item.status`:** `pending_approval | approved | rejected | sold | draft` (+ separate `published` boolean).
**v2 `listings.status`:** `draft | pending_review | active | reserved | sold | rejected | expired | removed`.

| Legacy | v2 | Note |
|---|---|---|
| `draft` | `draft` | |
| `pending_approval` | `pending_review` | |
| `approved` + `published:true` | `active` | |
| `approved` + `published:false` | `removed` | |
| `rejected` | `rejected` | carries `rejection_reason` |
| `sold` | `sold` | |

The legacy `published` boolean is folded into status — two overlapping visibility flags is exactly how `approved && !published` becomes an unrepresentable-but-real state.

**Legacy `Order.order_status`:** 19 declared values, of which the data uses 10 — **4 of them undeclared** (`window_confirmed`, `awaiting_buyer_window_selection`, `payment_received`, `reschedule_loop`) `[LI §2]`. Import mapping:

| Legacy status (count) | v2 status |
|---|---|
| `cancelled_due_to_inactivity` (68), `cancelled_by_buyer` (4), `cancelled_by_seller`, `cancelled_by_system`, `cancelled_by_mover` | `cancelled` |
| `request_submitted`, `awaiting_seller_response` (1) | `pending_seller_confirmation` |
| `seller_confirmed`, `window_confirmed` (9), `awaiting_buyer_window_selection` (4), `reschedule_loop` (1), `awaiting_phone_payment`, `paid_manual`, `payment_received` (3) | `confirmed` |
| `delivery_scheduled` (1), `mover_assigned` (2) | `delivery_scheduled` |
| `in_transit`, `awaiting_pickup` | `picked_up` |
| `delivered`, `ready_for_payout` | `delivered` |
| `completed` (1) | `completed` |
| `failed_delivery`, `admin_intervention_required` | `cancelled` + admin note |

**`payment_status` must NOT be migrated.** 88 of 94 orders carry `held_in_escrow` although no money was ever held `[LI §8.2]`, and `paid_at` is 0% filled even on the one paid order. Importing that field would encode a falsehood about money into a fresh ledger. Payment state is reconstructed from `payment_provider` + `payout_released_at` instead, and orders that cannot be reconstructed import as `cancelled`. → `[D-34]`

**Legacy `Item.condition`** has 6 values including near-duplicates (`טוב` and `מצב טוב` are the same condition written two ways) `[LI §2]`:

| Legacy (count) | v2 |
|---|---|
| `חדש לגמרי` (1), `כמו חדש` (16) | `like_new` |
| `מצב מצוין` (1) | `excellent` |
| `מצב טוב` (2), `טוב` (3) | `good` |
| `בסדר` (2) | `fair` |

### 3.4 Categories and brands

Live category values `[LI §2]`: `ספה` (14), `שולחן` (6), `שידה` (2), `כסא` (2), `כורסה` (1). The seed taxonomy from `[MP §5]` is a superset; import maps the five onto it (`ספה`→ספות וכורסאות, `כורסה`→ספות וכורסאות, `שולחן`→שולחנות, `כסא`/`כיסא`→כיסאות, `שידה`→שידות וקומודות).

`brand` is 64% filled as free text. Import matches against the seeded `brands` table case-insensitively and falls back to `brand_free_text`.

---

## 4. Business rules — as implemented vs. as specified for v2

### 4.1 Pricing — the biggest model change in the rebuild

**Legacy is a NET + markup model** `[LI §3]`:
- Seller names `requested_price` — the **net** amount they receive.
- Platform adds a markup (`DEFAULT_MARKUP = 1.12`, i.e. **12%**) → `display_price`, the **gross** price the buyer sees.
- `platform_fee = display_price − requested_price`.
- Admin can override the display price by hand, so **realised fees range 12%–22%** (e.g. ₪540 on ₪4,500 = 12%; ₪200 on ₪900 = 22%).
- Fossils: an 8% fallback in `pricing.jsx`, a dead 15% constant in the HowItWorks calculator, and 5%+₪15 snapshots in old orders `[LI §8.14]`.

**v2 is a GROSS − commission model** `[MP §3.5]`:
- Seller names the asking price — the **gross** amount the buyer pays.
- Platform deducts **20%** from the payout.

These are not the same business. The consequence is spelled out in §7 C-1 and it is the single most important thing for Tom to read in this document.

### 4.2 Delivery pricing — legacy engine vs. v2 zones

**Legacy `ShippingEngine`** `[LI §3]` is genuinely sophisticated:
- Base by logistics tier (derived from dimensions/category): T1 ₪250, T2 ₪270, T3 ₪320, T4 ₪400, **T5 ₪650**.
- Haversine distance fee: ≤2km ₪40 … ≤25km ₪280, then +₪20/km.
- Floor fee per floor, no elevator, **both ends**: T1/2 ₪15, T3 ₪25, T4 ₪40, T5 ₪60.
- Minimum ₪250. Service area: 20 named Gush Dan cities; outside → hard error.

**v2 `[MP §3.5]`** is flat zones: A ₪149 / B ₪199 / C ₪249, +₪50 per side for floor ≥3 without lift, +₪100 disassembly.

The simplification is a deliberate product decision (a buyer can understand three numbers; nobody understands a Haversine tier matrix). But see §7 C-2: **on the observed item mix, the v2 zone prices sit below what the legacy engine charged for the same jobs**, and the legacy engine's floor was ₪250. This is a margin risk that must be measured, not assumed away.

The 20-city service area is real operational knowledge and is carried into `delivery_zones` seeding.

### 4.3 Timeouts — legacy vs. v2

| Timer | Legacy `[LI §3]` | v2 `[MP §3.3]` | Config key |
|---|---|---|---|
| Seller no-response | **24h** → auto-cancel | **48h** → auto-cancel + auto-refund | `seller_confirm_hours` |
| Payment no-response | 48h | n/a (paid at checkout) | — |
| Post-confirm stall | 72h | n/a | — |
| Buyer protection | 12h / 24h / 48h — **contradictory across pages** `[LI §8.13]` | **48h** | `protection_hours` |
| Admin escalation | 24h → AdminTask + email | admin kanban surfaces stuck orders | — |
| Listing TTL | none | 90 days | `listing_ttl_days` |

Legacy auto-cancel wrote `cancellation_reason = "system_timeout:<status>:<hours>h"` — a good, greppable convention worth keeping. v2 writes the same shape into `order_events.payload`.

### 4.4 Delivery scheduling — operational knowledge worth preserving

From `TwoOptionSlotPicker` and `HandledMailer` `[LI §3]`:
- **Shifts, not 3-hour windows:** בוקר 09:00–12:00, צהריים 12:00–16:00, ערב 16:00–19:00.
- **Constraints:** earliest = tomorrow; **no Saturdays**; **Friday morning only**; ≤90 days ahead.

`[MP §3.3]` asks for "date + 3-hour window". The legacy shift model satisfies that (each shift is a 3–4h window) and encodes real Israeli-calendar logistics that a naive time picker would get wrong — a Saturday pickup slot is not a minor UI bug, it is an appointment nobody will keep. v2 adopts the shift model. → `[D-32]`

### 4.5 Other implemented rules

| Rule | Legacy value | v2 |
|---|---|---|
| Cancellation fee after seller confirm | **₪50**, in published Terms + CancellationPolicy; field exists, **never once charged** | kept as `cancellation_fee_agorot` (§7 C-6) |
| Min item price | ₪200 | ₪50 `[MP §3.2]` |
| Min photos | 3 | 3–10 `[MP §3.2]` |
| Free resale after delivery | **7 days, zero platform fee** — a published promise `[LI §7.6]` | kept (§7 C-7) |
| Item reservation | `reserved_by`/`reserved_until`; **cleanup automation disabled after 5 failures** `[LI §5]` | `reserved` listing status, released by the order state machine — no separate janitor to fail |

---

## 5. Gaps

| # | Gap | Resolution |
|---|---|---|
| G-1 | **No offers mechanic.** Legacy is fixed-price, "zero negotiation" by design `[LI §0]`. | Built in full (Phase 3). `[D-15]` |
| G-2 | No payout ledger — 1 payout ever, tracked in ad-hoc fields. | `payouts` + `/admin/payouts`. `[D-16]` |
| G-3 | No runtime config — fees hardcoded across ≥4 files with contradictory constants. | `site_config` + `/admin/config`. `[D-17]` |
| G-4 | **No SEO surface.** SPA, query-string URLs, no category/brand/city pages, no structured data. | Phase 5 in full. |
| G-5 | Delivery pricing not configurable without a deploy. | `delivery_zones` + pure fee engine. |
| G-6 | No listing expiry — 22 active listings, oldest from Oct 2025. | 90-day TTL + renew. |
| G-7 | Audit trail split across 4 tables, two of them empty, one written outside its own enum. | `order_events`, append-only. `[D-05]` |
| G-8 | **No RLS anywhere.** | Full RLS + `db/rls_test.sql` in Gate 1. `[D-31]` |
| G-9 | Admin UI graveyard — 6 abandoned admin generations still routed. | 7 focused surfaces; old routes 301 or dropped. |
| G-10 | No demand capture for buyers who find nothing. | `saved_searches` + daily cron. |
| G-11 | Address privacy not enforced at the data layer. | Column split + RLS. `[D-06]` |
| G-12 | No pickup inspection step. | `picked_up` carries an inspection outcome. `[D-12]` |
| G-13 | **Q&A on listings** (`ItemQuestion`, moderated: question → admin → seller → admin → publish, with an anti-bypass flag). 3 records. | **Deferred.** It is a messaging surface, and messaging is out of scope `[MP §10]`. Schema note kept so it can return. |
| G-14 | **Promo/coupon system** (`RESTYLE50`, 50% off shipping, TLV-only, expires 2026-04-01). Shipped, **0 uses**. | **Deferred.** Expired before v2 ships; rebuilding an unused, expired promo is waste. Noted in FINAL_REPORT as future work. |
| G-15 | **Unauthenticated mutating deep links** in emails (`/SellerResponse?orderId=…&action=approve`). | Auth-gated in v2. `[D-33]` |
| G-16 | Order creation and all transactional email run **client-side**; "atomic reservation" is not atomic `[LI §4]`; 51 failed email events. | Server Actions + DB transitions; notifications server-side behind `NotificationProvider`. |

---

## 6. Copy inventory

`docs/COPY.md` is the single source of truth for UI strings. Unlike revision 1 — which had to author copy from scratch — the legal and marketing copy is now **available verbatim** `[LI §7]` and is reused as-is, with three deliberate corrections (§7 C-4, C-5) where the published text states something the v2 system will not do.

Reused verbatim: Terms (19 sections), Privacy (9 sections), Cancellation Policy (6 sections), Accessibility statement, How It Works (both buyer and seller tracks, all FAQs), Buyer Protection, and ~40 email subjects with body copy.

---

## 7. Conflicts found during reconciliation

Per the master prompt: where LEGACY_INTELLIGENCE.md conflicts with the master prompt, the master prompt wins, **but the conflict and its consequence are recorded.** These are ordered by business impact.

---

### C-1 — Pricing model inversion (**highest impact — Tom must read this**)

| | Legacy | v2 spec |
|---|---|---|
| What the seller names | **Net** — what they receive | **Gross** — what the buyer pays |
| Platform take | +12% markup on top | −20% commission from payout |

**Resolution:** v2 spec wins — `[MP §3.5]` is explicit and it matches AptDeco.

**Consequence, stated plainly.** Take a real listing from the data `[LI §2]`: seller wanted ₪900 net; buyer paid ₪1,100; platform kept ₪200.
- Under v2, if that seller lists at **₪1,100** (preserving the buyer price), they receive ₪880 — **₪20 less than they used to get**, and the platform earns ₪220.
- If instead they list at **₪900** (the number they think of as "their price"), they receive ₪720 — **₪180 less than before** — and the buyer price silently drops 18%.

The second case is the trap: sellers migrating from the legacy app will type the number they are used to typing, and quietly lose 20% of it. Two mitigations are built in:
1. **Import maps `pricing.display_price` → `listings.price_agorot`**, never `requested_price`. This preserves buyer-facing prices and keeps seller economics roughly whole. → `[D-35]`
2. The sell wizard shows a live **"תקבלו: ₪X"** payout figure next to the price input, so the gross/net distinction is impossible to miss. → `[D-36]`

**Left to Tom (not a code decision):** 20% gross-side is materially more take than the 12% markup the pilot ran on. That is intentional per the spec, but it is a price increase to existing sellers and should be a conscious launch decision, not a discovery.

---

### C-2 — Delivery pricing: v2 zone fees are likely below cost

**Legacy** charged a ₪250 minimum, with tier-based bases up to ₪650 plus distance and per-floor fees. **v2** charges ₪149 / ₪199 / ₪249 flat by zone.

**Resolution:** v2 spec wins — `[MP §3.5]` is explicit, and the simplification is defensible as a customer-facing product decision.

**Consequence.** 15 of 25 live items are logistics tier 4 and one is tier 5 `[LI §2]` — this is a **sofa-heavy** catalogue, which is exactly what the tier system charges most for. A tier-4 sofa moving 12km with a 3rd-floor walk-up billed ₪400 + ₪160 + floor fees ≈ **₪600+** under the legacy engine. Zone B in v2 bills **₪199 + ₪100 = ₪299**. Unless crew costs are far below what the legacy pricing implied, **the platform is absorbing roughly half the delivery cost on its most common item type.**

This is not a reason to disobey the spec — it is a reason to make the loss visible. Built in accordingly:
- The fee engine is pure and config-driven, so zone prices are one admin edit away `[D-18]`, `[D-17]`.
- Every order records `delivery_agorot` and surcharges separately from item price, so realised delivery revenue is a first-class KPI.
- **The Phase 4 admin KPI dashboard includes delivery revenue vs. order volume by zone and category**, so the gap shows up in week one rather than in an annual reconciliation. → `[D-37]`

Recommendation carried to FINAL_REPORT: capture actual crew cost per delivery (a single field on `deliveries`) and compare against `delivery_agorot` before scaling.

---

### C-3 — Payment provider: Sumit, not PayPlus

`[MP §4]` specifies a `PayPlusProvider` skeleton. Ground truth `[LI §5]` shows the business already runs **Sumit** (sumit.co.il) with a live `SUMIT_SECRET_KEY`, a proven `sumitCharge` path (one real ₪3,290 charge), plus refund/authorize/capture/void functions — the J5 auth-capture endpoints were probed but never confirmed, which is precisely why `[MP §3.3]` defers authorize-then-capture.

**Resolution:** build both. The `PaymentProvider` interface + `MockPaymentProvider` + `PayPlusProvider` skeleton exactly as specified, **plus** a `SumitProvider` skeleton modelled on the endpoints the audit documents. `PAYMENT_PROVIDER` accepts `mock | payplus | sumit`, defaulting to `mock`. This costs one extra adapter file and means Tom can go live on the PSP he already has an account with. → `[D-38]`

---

### C-4 — Buyer-protection window stated four different ways

Terms §7 and the Buyer Protection page say **12 hours**; the buyer FAQ says **48 hours**; the delivery-completed email says **24 hours**; payout logic uses **48 hours** `[LI §8.13]`.

**Resolution:** **48 hours** everywhere `[MP §3.3]`, `protection_hours` config.

**Consequence for verbatim copy.** This is the one place where reusing published legal text verbatim would be *wrong*: leaving "12 שעות" in the Terms while the system grants 48 would mean the published contract understates the buyer's rights and contradicts the product. The three affected strings are corrected to 48 hours in COPY.md, and the change is flagged in the file so a lawyer can see exactly what moved. Nothing else in the legal copy is reworded. → `[D-39]`

---

### C-5 — Privacy policy names the wrong payment processors

`[LI §7.2]` names "PAYME / Tranzila / Morning"; the actual processor was Sumit, and v2's will be whatever `PAYMENT_PROVIDER` selects.

**Resolution:** replace the parenthetical with a provider-neutral phrase ("ספק סליקה מאובטח המורשה לפעול בישראל") rather than naming a processor that will change again. Naming the wrong processor in a privacy policy is a factual misstatement about where personal data flows. → `[D-39]`

---

### C-6 — ₪50 cancellation fee is published but was never charged

Published in both Terms §4 and Cancellation Policy §2; `cancellation_fee_amount` exists on every order and is **always 0** `[LI §3]`. `[MP §3.3]` says a buyer may cancel before pickup but is silent on a fee.

**Resolution:** implement it as `cancellation_fee_agorot` in `site_config`, **defaulting to 5000** (₪50) so the system matches the published contract, applied only on buyer-initiated cancellation *after* seller confirmation — exactly what the policy says. Tom can set it to 0 from the admin config editor if he prefers the pilot's de-facto behaviour. Building it as config rather than as code means the published policy and the running system cannot silently diverge again. → `[D-40]`

---

### C-7 — "Free resale" is a published promise with no implementation

The Buyer Protection page promises: within **7 days of delivery**, relist the item **with no platform fee** `[LI §7.6]`. `Item.resale_source_order_id` exists and is 0% filled. `[MP]` does not mention it.

**Resolution:** keep the promise; it is cheap and it is a genuinely good retention mechanic for a marketplace whose hardest problem is supply. Implementation is two small pieces: a nullable `commission_pct_override` on `listings` honoured by the pure fee engine, and a "מכור מחדש ללא עמלה" action on a delivered order that pre-fills the sell wizard with `resale_source_order_id` set. → `[D-41]`

---

### C-8 — Legacy record ids are 24-char hex, not uuids

Affects only `legacy_redirects` and the import script: the redirect key is `text`, matched case-insensitively, and the middleware must handle both `/ItemDetails` and `/itemdetails` `[LI §6]`. Also carried: all the other redirect-critical paths that appear in already-sent emails. → `[D-42]`

---

### C-9 — Seller confirmation is the funnel, and 24h was too short

Legacy auto-cancelled after **24h**; 72% of orders died there. v2 uses **48h** `[MP §3.3]`.

**Resolution:** v2 spec wins, and it is the right direction — but doubling the timer alone will not fix a 72% failure rate. Recorded as a product finding rather than a code conflict: reminder emails inside the window (legacy had 12h/24h reminder fields on `DeliveryWindow` it never fully used) and making confirmation a one-tap authenticated action are the levers. The reminder cron is built in Phase 3; seller-confirmation rate is instrumented in Phase 4. → `[D-43]`

---

### C-10 — Contact details and operational identity

Ground truth supplies real values now used in COPY.md and config: support `support@restyle.co.il`, phone/WhatsApp **053-7252858**, accessibility coordinator **תום ויט**, production domain `restyle.co.il`, sender name "Restyle".

**Not carried over:** the hardcoded personal Gmail that legacy used for admin alerts `[LI §8.17]`, and the inconsistent `tom@restyle.co.il` support link. v2 routes all admin notification to the `ADMIN_EMAIL` env var `[D-29]` and uses `support@restyle.co.il` uniformly.
