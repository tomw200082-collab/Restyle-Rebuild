# SPEC.md — Restyle, compressed

**Read this before touching anything.** It is the living truth of the product,
dense on purpose: a session that reads only this file must be unable to violate
the product. Where it disagrees with `CLAUDE.md`, `CLAUDE.md` wins and this file
is wrong — fix it in the same PR.

Maintained under `.claude/skills/restyle-spec-discipline/`. Every bug that
reaches `main` or fails a gate becomes an invariant here **and** a regression
test, in the same PR as its fix.

---

## 1. What it is

Hebrew-first marketplace for second-hand furniture in Gush Dan. Seller lists
free → admin approves → buyer buys on-platform → Restyle's own crew collects and
delivers → seller is paid after the buyer-protection window.

Restyle holds the money between two strangers. That is the whole product.

## 2. Money

- **Integer agorot. `bigint` in Postgres, whole-agora `number` in TS.** No
  floats, no `numeric`, no formatted strings, no exceptions. `[D-01]`
- **`commission + seller_payout = item_agorot`, exactly.** Enforced by a CHECK
  constraint, not by the application. `[D-10]`
- **Commission rounds down** (`Math.floor`), so rounding never creates money and
  the residual agora goes to the seller. Payout is derived by *subtraction*, so
  the identity above holds by construction. `[D-10]`
- **Commission is charged on the price actually paid** — an accepted offer is
  taxed at its own amount, not at the asking price. `[D-09]`
- One pure function, `computeOrderPricing`, is used by the checkout UI, by
  server-side validation, and by admin. Fee logic duplicated between client and
  server is *the* classic marketplace bug: buyer sees one total, server charges
  another. `[D-18]`

### Fee rules

```
item_agorot        = accepted offer amount, else listing price
delivery_agorot    = 0 for self-pickup
                   = fee of the HIGHER of (pickup zone, dropoff zone)   [MP 3.5]
surcharges         = floor_pickup   if pickup floor  >= 3 and no lift   (per side)
                   + floor_dropoff  if dropoff floor >= 3 and no lift   (per side)
                   + disassembly    if the listing needs it
                   + bulky          if size_class = 'bulky'
total_agorot       = item + delivery + surcharges
commission_agorot  = floor(item * commission_pct / 100)
seller_payout      = item - commission
```

- **Self-pickup carries no delivery charge at all** — no crew, no carry, no
  disassembly performed by the platform. Charging for work not done is
  indefensible at the first support ticket. `[D-08]`
- **The floor surcharge is per side.** The crew carries down at pickup and up at
  dropoff; those are separate efforts, so a walk-up at both ends charges twice.
  A lift at either end suppresses that side at any floor. `[D-07]`
- **Zone base prices are ₪149 / ₪199 / ₪249 (A/B/C) and do not change.** The
  ₪149 headline is a published promise. Item size is priced by the bulky
  surcharge, never by moving the zone fee. `[D-61]`
- Outside the delivery area → `OutOfServiceAreaError`, wording reused verbatim
  from the legacy engine because customers have already seen it.

### Config lives in `site_config`, not in constants

Every fee, window and threshold is a typed `jsonb` row, editable from admin,
with a documented default in code so a missing row degrades to the documented
value rather than to `NaN`. `[D-17]` The bounds an agent may move them inside
are in `EXECUTION_POLICY.md` §L4. Outside those bounds is **L5**.

## 3. The two state machines

Legal transitions are **data in a table**, not branches in code. Every change
goes through the SQL function, which takes a row lock; there is no
`UPDATE … SET status` anywhere in the application. `[D-04]`

### Orders — `transition_order()`

```
pending_seller_confirmation → confirmed | cancelled
confirmed                   → delivery_scheduled | cancelled
delivery_scheduled          → picked_up | cancelled      (cancel = inspection mismatch)
picked_up                   → delivered | cancelled      (cancel = inspection mismatch)
delivered                   → completed | disputed       (disputed only inside the window)
disputed                    → completed | refunded
cancelled                   → refunded
```

`completed` and `refunded` are terminal. Anything not on this list is impossible,
not merely uncommon — the e2e suite proves a seller cannot skip `confirmed` →
`delivered`.

### Listings — `transition_listing()`

```
draft          → pending_review | removed
pending_review → active | rejected | removed
rejected       → pending_review | removed      (re-submit after fixing)
active         → reserved | expired | removed
reserved       → sold | active                 (active = order cancelled)
expired        → active | removed              (one-click renew)
sold           → removed
```

A rejection **must** carry a reason — CHECK constraint. A rejection without one
is a support ticket.

### `order_events` is append-only truth

`UPDATE` and `DELETE` revoked, plus a trigger that refuses both, including for
the service role. Every transition writes an event. Nobody rewrites history.
`[D-05]`

## 4. Timings (defaults; all in `site_config`)

| | |
|---|---|
| Seller confirmation window | **48h**, then auto-cancel + full refund |
| Seller reminder | at **24h** into that window |
| Consecutive expired confirmations before the seller's other listings pause | **2** |
| Buyer protection window after delivery | **48h**, then auto-complete |
| Offer validity | **72h** |
| Exclusive checkout after an accepted offer | **24h** |
| Listing TTL | **90 days** |
| Free-resale window after delivery | **7 days**, zero commission |
| Cancellation fee after seller confirmation | **₪50** |

Published figures — the ₪50 fee, the 48h protection window, the 7-day resale
window — appear on the Terms and Cancellation Policy pages. **Changing one
without changing the page in the same commit is a defect,** and moving one
outside its `EXECUTION_POLICY.md` bound is L5.

Cron timing comes from **database timestamps, never from invocation time**, so a
late or missed run self-heals on the next tick. Every job is idempotent —
delivery is at-least-once and a retried auto-cancel must not refund twice.
Nothing is deleted destructively. `[D-20]`

## 5. Security invariants

1. **RLS on every table, always**, with policies in the same migration that
   creates the table.
2. **The seller's street address is protected by column privilege**, enumerated
   column-by-column, so a column added later is not granted — it fails closed.
   RLS is row-level and structurally cannot protect a column. `[D-06]`, `[D-45]`
3. **`SECURITY DEFINER` functions must have `EXECUTE` revoked from `PUBLIC`.**
   Postgres grants it by default and Supabase publishes everything in `public`
   at `/rest/v1/rpc/*` — so a definer function is an anonymous endpoint until
   you take that away. `transition_order` and `create_order` were both callable
   by anyone. `[D-44]`
4. **Every Supabase read destructures and throws its `error`.** A swallowed
   PostgREST error renders an empty page instead of failing. `[D-47]`
5. **The service-role key never reaches the browser** and every path that uses
   it does its own authorization check first. `[D-28]`
6. `/api/cron/*` is guarded by a constant-time bearer check. These endpoints
   cancel orders and issue refunds; an unguarded one is a public endpoint that
   moves money. `[D-20]`

## 6. Rendering & SEO invariants

- **Public pages read through the cookie-free anonymous client.** Any component
  reading cookies makes its whole route dynamic and deletes ISR. Session state
  lives in one small client component. `[D-46]`
- **Sold pages never 404.** 200 with a sold state plus category alternatives.
  The inbound link that page earned is the asset. `[D-33]`
- **`/sitemap.xml` must exist as a real URL.** Next's `generateSitemaps`
  relocates output to `/sitemap/<id>.xml` and publishes no index, so the one URL
  `robots.txt` points at must be served explicitly. `[D-49]`
- **Every indexable page carries exactly one self-referencing canonical, and it
  is set on the page, never on a layout.** A layout-level canonical is inherited
  by every page that does not override it, so it silently points them all at one
  URL. This is named because the home page — the site's highest-authority URL —
  shipped with no canonical at all for the whole of Run 1: it inherits title and
  description from the root layout, and nobody noticed that the one piece of
  metadata which cannot be inherited was therefore missing. `[D-67]`
- Canonical/noindex matrix and the cat×city threshold rules live in
  `.claude/skills/nextjs-seo-engine/`.

## 7. Named invariants from silent failures

These exist because each of them shipped, worked, and told nobody.

- **Public routes assert real status codes.** A test asserting on rendered text
  passes against a soft-404. `[D-49]`
- **Interactive elements assert computed contrast**, measured in a browser, not
  inferred from a class list — `tailwind-merge` dropped `text-white` from every
  primary button and the result stayed legible. `[D-51]`
- **Reference data is corrected in place, never deleted and re-inserted**, and
  every seed is idempotent and matches on natural keys. Two writers, one
  dataset. Slug drift 404s a route silently.
- **Schema parity is a measurement, not a belief** — object-level diff, function
  bodies hashed. File counts are not the measurement. `/drift-check`.
- **A skipped check is never a pass.** The release gate fails closed.

## 8. Language

Hebrew UI, English code. Every user-visible string Hebrew; every identifier,
comment, filename, commit message and log line English. No mixing in either
direction.

## 9. The L5 list — never autonomous

Executing refunds/payouts/live payments against real money · fee or commission
changes outside the `EXECUTION_POLICY.md` bounds · deleting or mutating
production rows outside the state machines · editing `CLAUDE.md` · DNS or domain
operations · switching `PAYMENT_PROVIDER` to a live provider · any write to the
legacy Base44 app · removing `ops/KILL_SWITCH` · committing or printing a secret.

## 10. Deliberately out of scope

WhatsApp integration, a crew-facing app, automated payouts, buyer–seller chat,
reviews and ratings, auctions, multi-language, native apps, a B2B portal,
subscriptions. The crew manifest is copyable text because that is what the ops
flow needs today; payouts are marked paid by hand because the money leaves by
bank transfer.

Adding any of these is a product decision, not an engineering one. See
`.claude/skills/restyle-yagni/`.

---

## 11. Invariants added by backprop

Each of these was added in the same PR as the fix for a bug that escaped. See
`.claude/skills/restyle-spec-discipline/`.

- **A canonical is set on the page, never on a layout.** A layout-level
  `alternates.canonical` is inherited by every page that does not override it.
  The home page shipped with none for all of Run 1 because it is the only public
  page with no metadata export of its own. `[D-67]`
- **A check that cannot read its own result has not passed.** A count parsed out
  of a runner's output must fail closed when it is absent. The gate's unit stage
  reported "0 unit tests passed" as green in CI, because vitest colourises its
  summary and the escape codes defeated the pattern. `[D-71]`
- **One thing owns the schema.** `supabase start` applies
  `supabase/migrations/` itself; running the repository's migration runner after
  it applies them a second time, and the second pass fails on the first
  migration without an `if not exists` guard. Do not make every migration
  re-runnable to hide a double-application — remove the second application.
  `[D-71]`
- **A measurement that varies with the machine is not a gate.** A sha256 of a
  rendered screenshot depends on the browser build, the font set and the
  catalogue; none is pinned here, so it can only pass where the baseline was
  made. Assert properties that hold anywhere — `dir="rtl"`, no sideways
  overflow at 390px — and keep the render as evidence. `[D-79]`
- **Report every measurement, not only the failing one.** A stage that prints
  only what missed its budget cannot distinguish one slow page from one slow
  machine. Lighthouse now prints all three scores for all three pages. `[D-80]`
- **One thing owns the served origin.** The release gate starts the server and
  names the origin in `E2E_BASE_URL`; anything handed that variable reuses it
  rather than starting its own. Ports are derived from the URL, never stated a
  second time. `[D-81]`
- **A status is public in four places, and they must agree.** The enum, the
  transition table, the query's status list and the RLS policy. `paused` was
  added to three of them and the item page 404'd. `[D-82]`
- **A setup must prove the artefact it produces, not the step that produced
  it.** Asserting a login succeeded is not asserting the saved storage state
  authenticates. Eleven buyer specs failed on eleven unrelated locators and
  none of them named the session. `[D-83]`
- **A measurement must be able to prove which target it measured.** Three
  Lighthouse runs sharing one browser audited a leftover target and reported a
  missing `<title>` on a page that has always had one. A defect that is
  plausible and carries a number is the hardest kind to disbelieve. `[D-84]`
- **No spec may mutate a shared fixture's authentication state.** `signOut()`
  defaults to global scope and revokes every session that account holds. The
  anon sign-out spec used the buyer account and silently signed eleven buyer
  specs out. `[D-85]`
- **A count must reconcile against its own total.** Passed, flaky, skipped and
  did-not-run must add up to the number the suite announced, or tests went
  missing. "74 passed" and "77 ran" were both true of one run. `[D-86]`
- **A gate may not move the head it is judging.** A `GITHUB_TOKEN` push parks
  its workflow runs as `action_required` and never runs them, so committing
  back to the PR branch leaves a head with no checks — un-mergeable under
  §L2, by the gate's own doing. `[D-88]`
- **A credential never travels in argv.** psql quoted a malformed password
  back in an error and it landed in a public CI log; secret masking cannot
  catch a fragment of the string it was given. Use `PG*` environment
  variables, and scrub anything on its way to a log. `[D-89]`
- **No client component derives a date from its own clock.** The server and the
  browser run the same line at different instants; either side of midnight they
  disagree, React re-renders the subtree, and the control the user is operating
  detaches. Compute it on the server and pass it down. `[D-90]`
- **A job reports only what it measured.** No comparison means no drift claim,
  however loudly the run failed. `drift-weekly` posted "Schema drift: unknown"
  and then "Still drifting" on two runs that never reached the remote at all.
  `[D-92]`
- **A failing check prints what failed.** Not the last lines it produced — a
  runner puts its diagnosis above the attachments, so a tail lands on
  screenshot filenames. The gate announced "e2e suite failed" with nothing in
  the log naming the assertion. `[D-93]`
- **A derived control is asserted populated before it is read.** A select whose
  options come from another select gets them one render later, and
  `evaluateAll` does not retry the way an assertion does. `[D-94]`
