---
name: restyle-e2e
description: Use for all Restyle testing work — writing or debugging Playwright end-to-end specs, Vitest unit tests, test fixtures, authenticated test contexts, seeding or resetting test data, simulating payment, or testing time-dependent behaviour like the 48-hour timeouts. Triggers on "test", "e2e", "Playwright", "Vitest", "fixture", "spec", "storageState", "seed reset", "mock payment", "timeout test", "flaky", "gate". Carries the multi-actor fixture pattern, the seed-reset strategy, the mock-payment walkthrough, the time-travel pattern, and each gate's required coverage.
---

# Restyle testing

Two layers, each with a job it is actually good at.

**Vitest** owns pure logic: the fee engine, state-machine transition tables, slug transliteration, Zod schemas, date/currency formatting, the legacy import mappers. Fast, exhaustive, no I/O.

**Playwright** owns journeys that cross the whole stack: browser → server action → RLS → database → back. Few specs, each one covering a path that would cost real money if it broke.

The rule for deciding: if the failure would be a wrong number, unit-test it. If the failure would be a wrong *outcome* — an order in the wrong state, a listing someone shouldn't see, an address leaked — Playwright it.

## Actors

Three seeded actors, deterministic uuids and credentials, created in `db/seed.ts`:

| Actor | Email | Role |
|---|---|---|
| buyer | `buyer@restyle.test` | `user` — owns orders, offers, favourites |
| seller | `seller@restyle.test` | `user` — owns listings, confirms sales |
| admin | `admin@restyle.test` | `admin` — approves, schedules, resolves, pays out |

Authentication happens **once**, in `globalSetup`, producing three `storageState` JSON files. Every spec then attaches the state it needs; no spec logs in through the UI except the one spec whose subject *is* logging in.

```ts
// playwright.config.ts
projects: [
  { name: 'setup', testMatch: /global\.setup\.ts/ },
  { name: 'buyer',  use: { storageState: '.auth/buyer.json'  }, dependencies: ['setup'] },
  { name: 'seller', use: { storageState: '.auth/seller.json' }, dependencies: ['setup'] },
  { name: 'admin',  use: { storageState: '.auth/admin.json'  }, dependencies: ['setup'] },
  { name: 'anon',   use: { storageState: { cookies: [], origins: [] } }, dependencies: ['setup'] },
]
```

The `anon` project is not an afterthought — it is where the privacy assertions live. `[D-31]`

For a single spec that needs two actors interacting (buy → confirm), open a second browser context rather than switching projects:

```ts
const sellerCtx = await browser.newContext({ storageState: '.auth/seller.json' });
const sellerPage = await sellerCtx.newPage();
```

## Seed and reset

`db/seed.ts` is idempotent and deterministic — no `Math.random()`, no `new Date()`. Seeds that vary per run make assertions unwritable.

Strategy, in order of preference:

1. **Read-only specs** (catalogue, item page, SEO, anon privacy) run against the shared seed and never mutate. These parallelise freely.
2. **Mutating specs** create their own listing/order inside the test via a `fixtures/factory.ts` helper, so they don't collide. Factories take overrides and return typed rows.
3. **Specs that must mutate seeded rows** (the full lifecycle spec) run in `test.describe.serial` and call `resetDb()` in `beforeAll`.

```ts
// tests/fixtures/db.ts
export async function resetDb() {
  execSync('npm run db:reset', { stdio: 'inherit' });  // truncate + reseed
}
```

Never assert on absolute row counts from the shared seed (`expect(cards).toHaveCount(30)`) — the first factory-created listing breaks it. Assert on presence, relative ordering, and the specific rows the test created.

## Mock payment

`PAYMENT_PROVIDER=mock` is the default and the only provider tests use. The mock's `createCheckout()` returns `/pay/mock/[orderId]`, a real page in the app with **הצלחה** and **ביטול** buttons that post back to the same webhook handler the real PSP would call.

```ts
export async function payWithMock(page: Page, outcome: 'success' | 'cancel' = 'success') {
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await page.getByTestId(outcome === 'success' ? 'mock-pay-success' : 'mock-pay-cancel').click();
  await page.waitForURL(/\/checkout\/.*\/(success|cancelled)/);
}
```

This matters more than it looks: the mock exercises the *real* webhook route, the real signature-verification branch (stubbed to accept in mock mode), and the real state transition. Only the HTTP call to a PSP is replaced. A mock that shortcuts straight to `status = 'confirmed'` would test nothing.

## Time travel

Three timers drive the product: seller confirmation (48h), buyer protection (48h), offer expiry (72h). Tests must not wait, and must not fake the system clock.

**Do not** use `page.clock` or freeze `Date.now()`. The timers are evaluated **in SQL** against stored timestamps `[D-20]`, so a browser clock has no effect and a mocked Node clock only fools the process that isn't doing the comparison.

**Do** backdate the row, then run the job:

```ts
// tests/fixtures/time.ts
export async function backdate(table: string, id: string, column: string, hours: number) {
  await sql(`update ${table} set ${column} = now() - interval '${hours} hours' where id = $1`, [id]);
}

export async function runCron(job: 'expire-offers' | 'seller-timeout' | 'protection-window') {
  const res = await fetch(`${BASE_URL}/api/cron/${job}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status).toBe(200);
}
```

```ts
await backdate('orders', orderId, 'created_at', 49);
await runCron('seller-timeout');
await expect(orderStatus(orderId)).resolves.toBe('cancelled');
```

This tests the actual production query rather than a simulation of it, and it catches the class of bug where a job compares against the wrong column.

Every cron job is asserted **twice in a row** — running it again must be a no-op, not a second refund. At-least-once delivery is the contract, so idempotency is a tested property, not an assumption. Pure timer logic (`isPastDeadline(order, config, now)`) also gets Vitest cases with `now` injected directly.

## Selectors

`getByRole` and `getByLabel` first — they assert accessibility as a side effect, which matters for a product with a legal accessibility statement.

Use `data-testid` for: anything whose visible text is a Hebrew string a copywriter will change, price displays, status badges, and the mock-pay buttons. A test that breaks because someone improved a Hebrew label is a test that trains people to ignore failures.

Never select by CSS class — Tailwind classes change on every restyle.

## Coverage per gate

Every gate's suite must stay green before the next phase starts.

**Gate 1 — foundation.** `db/rls_test.sql` passes (both directions per policy). Seed runs twice with identical results. Sign in and out round-trips. Layout renders `dir="rtl"`.

**Gate 2 — marketplace core.**
- anon: browse `/catalog` → filter by category → open an item → all specs render.
- **anon privacy: `pickup_street` appears nowhere in the item page HTML.** Assert against the raw response body, not the rendered DOM.
- buyer: favourite an item, see it in the dashboard, unfavourite it.
- seller: full sell wizard with mock AI → lands in `pending_review`, not `active`.
- delivery estimator returns the right fee for a Zone A, Zone B and Zone C city.

**Gate 3 — transactions.**
- buy with mock pay → order `pending_seller_confirmation`, listing `reserved`.
- seller confirms → `confirmed`; `order_events` has both transitions.
- offer → accept → checkout at the offer price; commission computed on the paid price `[D-09]`.
- seller-timeout cron on a backdated order → `cancelled` + refund event; second run is a no-op.
- offer expiry cron.

**Gate 4 — full lifecycle.** One serial spec, three contexts:
admin approves → buyer buys → seller confirms → admin schedules → `picked_up` → `delivered` → backdate + protection cron → `completed` → payout row appears `pending` → admin marks paid.
Assert an `order_events` row exists for **every** transition. Assert money: `commission + payout == item`, `total == item + delivery + surcharges`.

**Gate 5 — SEO.** `sitemap.xml` parses and contains a seeded item, category and brand. JSON-LD validates on item/category/home. A sold item returns **200**, not 404. Legacy `/ItemDetails?id=<hex>` 301s to the new slug, in both letter casings. Multi-filter catalogue URLs carry `noindex`.

**Gate 6 — clean clone.** From a fresh checkout: `npm i` → env from `.env.example` → seed → build → the whole suite green.

## Flake discipline

A flaky test is a broken test. `retries: 0` locally so flake is visible; at most 1 in CI.

- Never `waitForTimeout`. Wait for a state: `waitForURL`, `toBeVisible`, `toHaveText`.
- Assert with `expect(locator)`, which auto-retries. `expect(await locator.textContent())` does not, and is the most common source of flake in this codebase's shape.
- After a mutation, wait for the observable consequence (a badge changing to `המוכר אישר`), not for a network idle event.
- ISR pages can serve stale content right after a mutation; in specs that mutate and immediately re-read, assert against the dashboard (dynamic) rather than the ISR page, or explicitly wait for the revalidated value.
