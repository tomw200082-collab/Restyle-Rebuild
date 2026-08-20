import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  closeDb,
  createListing,
  getListingStatus,
  getOrder,
  getOrderEvents,
  getPayoutForOrder,
  latestOrderForListing,
  runCron,
  sql,
} from '../fixtures/db';

/**
 * Gate 4 — the whole thing, end to end, with three real actors.
 *
 * Serial because each step depends on the last: this is one journey, not five
 * independent assertions.
 */
test.describe.configure({ mode: 'serial' });

// One journey across three actors and a dozen page loads. The default 30s is a
// per-test budget sized for a single interaction, not for this.
test.setTimeout(90_000);

test.afterAll(async () => {
  await closeDb();
});

async function asRole(browser: Browser, role: 'buyer' | 'seller' | 'admin'): Promise<Page> {
  const context = await browser.newContext({ storageState: `.auth/${role}.json` });
  return context.newPage();
}

/**
 * Pick a real option out of a live <select> rather than naming a value.
 *
 * Shift availability is a function of the date — Friday offers the morning
 * only, Saturday nothing — so a hardcoded 'evening' passes or fails depending
 * on which weekday the suite happens to run. `index` counts from the first
 * real option, skipping the "בחרו" placeholder; negative indexes count back
 * from the end.
 *
 * **The wait is the point.** `#pickup-shift` and `#dropoff-shift` are disabled
 * until the date beside them has a value, and their options are derived from
 * that date — so choosing the date is what creates them, one React render
 * later. `evaluateAll` resolves whatever matches at the instant it runs and,
 * unlike a Playwright assertion, never retries: on a loaded runner it can see
 * the placeholder alone and this helper then reports a select with three
 * options as having none. Assert the list is populated first; everything after
 * that reads a settled DOM. [D-94]
 */
async function selectByIndex(page: Page, selector: string, index: number) {
  // `:not([value=""])` drops the "בחרו" placeholder in the locator rather than
  // after the fact, so the assertion below is about real options.
  const options = page.locator(`${selector} option:not([value=""])`);
  await expect(
    options,
    `${selector} never offered an option — the select it derives from may not have been set`,
  ).not.toHaveCount(0);

  const values = (await options.evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLOptionElement).value),
  )) as string[];
  const value = index < 0 ? values.at(index) : values[index];
  if (!value) {
    throw new Error(`${selector} offered no option at index ${index} — ${values.length} available`);
  }
  await page.locator(selector).selectOption(value);
  return value;
}

test('approve → buy → confirm → schedule → pick up → deliver → complete → pay out', async ({
  page: adminPage,
  browser,
  baseURL,
}) => {
  // ---- 1. Admin approves a submitted listing -------------------------------
  const listing = await createListing({ status: 'pending_review', price_agorot: 100_000 });

  await adminPage.goto('/admin/review');
  const card = adminPage.getByTestId('review-card').filter({ hasText: listing.title });
  await expect(card).toHaveCount(1);
  await card.getByTestId('approve').click();
  await expect(card).toHaveCount(0);

  expect(await getListingStatus(listing.id)).toBe('active');

  // ---- 2. Buyer purchases ---------------------------------------------------
  const buyerPage = await asRole(browser, 'buyer');
  await buyerPage.goto(`/checkout/new?listing=${listing.id}`);
  await buyerPage.getByLabel('עיר').selectOption('חולון');
  await buyerPage.getByLabel('רחוב ומספר').fill('רחוב המסירה 4');
  await buyerPage.getByTestId('checkout-submit').click();
  await buyerPage.waitForURL(/\/pay\/mock\//);
  await buyerPage.getByTestId('mock-pay-success').click();
  await buyerPage.waitForURL(/\/success/);

  const orderId = (await latestOrderForListing(listing.id))!;
  expect((await getOrder(orderId))?.status).toBe('pending_seller_confirmation');

  // ---- 3. Seller confirms with pickup windows -------------------------------
  const sellerPage = await asRole(browser, 'seller');
  await sellerPage.goto(`/dashboard/seller/orders/${orderId}`);

  const dates = sellerPage.locator('select[aria-label^="תאריך"]');
  const shifts = sellerPage.locator('select[aria-label^="שעות"]');
  for (const index of [0, 1]) {
    const value = await dates.nth(index).locator('option').nth(index + 1).getAttribute('value');
    await dates.nth(index).selectOption(value!);
    await shifts.nth(index).selectOption('morning');
  }
  await sellerPage.getByTestId('confirm-submit').click();
  await expect(sellerPage.getByTestId('confirm-sale')).toBeHidden();
  expect((await getOrder(orderId))?.status).toBe('confirmed');

  // ---- 4. Admin schedules the delivery --------------------------------------
  await adminPage.goto(`/admin/orders/${orderId}`);
  await expect(adminPage.getByTestId('schedule-form')).toBeVisible();

  const pickupDate = await selectByIndex(adminPage, '#pickup-date', 0);
  await selectByIndex(adminPage, '#pickup-shift', 0);
  await selectByIndex(adminPage, '#dropoff-date', 1);
  await selectByIndex(adminPage, '#dropoff-shift', -1);
  await adminPage.getByLabel('שם הצוות').fill('צוות בדיקה');
  await adminPage.getByLabel('טלפון הצוות').fill('050-1234567');
  await adminPage.getByTestId('schedule-submit').click();

  await expect(adminPage.getByTestId('pickup-form')).toBeVisible();
  expect((await getOrder(orderId))?.status).toBe('delivery_scheduled');

  // The manifest is the artefact the crew actually receives.
  await adminPage.goto(`/admin/deliveries?date=${pickupDate}`);
  await adminPage.getByText('מניפסט יומי').click();
  const manifest = await adminPage.getByTestId('manifest-text').innerText();
  expect(manifest).toContain('רחוב הבדיקה 1'); // the seller's pickup address
  expect(manifest).toContain('צוות בדיקה');

  // ---- 5. Pickup, with the inspection that makes protection real ------------
  await adminPage.goto(`/admin/orders/${orderId}`);
  await adminPage.getByTestId('mark-picked-up').click();
  await expect(adminPage.getByTestId('mark-delivered')).toBeVisible();
  expect((await getOrder(orderId))?.status).toBe('picked_up');

  // ---- 6. Delivery ----------------------------------------------------------
  await adminPage.getByTestId('mark-delivered').click();
  await expect(adminPage.getByTestId('mark-delivered')).toBeHidden();

  const delivered = await getOrder(orderId);
  expect(delivered?.status).toBe('delivered');
  // The listing is finally sold — and stays live at its URL as an SEO asset.
  expect(await getListingStatus(listing.id)).toBe('sold');

  // ---- 7. Protection window elapses ----------------------------------------
  // Backdated rather than waited on: the job compares stored timestamps, so
  // this exercises the real query. [D-20]
  await sql(
    `update public.orders set protection_expires_at = now() - interval '1 hour' where id = $1`,
    [orderId],
  );
  await runCron('protection-window', baseURL!);

  const completed = await getOrder(orderId);
  expect(completed?.status).toBe('completed');

  // ---- 8. Payout appears, and is paid --------------------------------------
  const payout = await getPayoutForOrder(orderId);
  expect(payout?.status).toBe('pending');
  expect(Number(payout?.amount_agorot)).toBe(Number(completed!.seller_payout_agorot));
  expect(Number(payout?.amount_agorot)).toBe(80_000); // ₪1,000 less 20%

  await adminPage.goto('/admin/payouts');
  // Keyed on the order, not the rendered price: he-IL formats ILS as
  // "‏800 ‏₪" — symbol trailing, with directional marks and a non-breaking
  // space — so a "₪800" substring never matches anything.
  const payoutRow = adminPage.locator('[data-order-id="' + orderId + '"]');
  await payoutRow.getByTestId('mark-paid').click();
  await payoutRow.getByTestId('mark-paid-confirm').click();
  // Asserted on the row's state, not on the word: once `paid_at` is set, the
  // metadata line reads "שולם <date>" as well as the badge, so matching the
  // text is a race between two correct renderings.
  await expect(payoutRow).toHaveAttribute('data-status', 'paid');

  expect((await getPayoutForOrder(orderId))?.status).toBe('paid');

  // ---- 9. The seller was actually told, at every step -----------------------
  // The legacy platform's emails failed silently 51 times and nobody knew.
  await adminPage.goto('/admin/notifications?status=failed');
  await expect(adminPage.getByTestId('notification-row')).toHaveCount(0);

  await adminPage.goto('/admin/notifications');
  const log = adminPage.getByTestId('notification-row');
  await expect(log.filter({ hasText: 'seller@restyle.test' }).first()).toBeVisible();

  // ---- 10. Every transition is in the audit ---------------------------------
  const events = (await getOrderEvents(orderId)).map((e) => e.type);
  for (const expected of [
    'order_created',
    'payment_captured',
    'seller_confirmed',
    'delivery_scheduled',
    'picked_up',
    'delivered',
    'protection_window_elapsed',
    'payout_queued',
    'payout_paid',
  ]) {
    expect(events, `missing audit event: ${expected}`).toContain(expected);
  }

  // ---- 11. The money still balances ----------------------------------------
  const final = await getOrder(orderId);
  expect(Number(final!.commission_agorot) + Number(final!.seller_payout_agorot)).toBe(
    Number(final!.item_agorot),
  );
  expect(Number(final!.total_agorot)).toBe(100_000 + 19_900); // item + zone B delivery

  // The buyer sees the same history the admin does.
  await buyerPage.goto(`/dashboard/buyer/orders/${orderId}`);
  await expect(buyerPage.getByTestId('order-timeline')).toContainText('הפריט נמסר');
});

test('a pickup inspection mismatch cancels the order and refunds in full', async ({
  page: adminPage,
  browser,
}) => {
  const listing = await createListing({ price_agorot: 50_000 });

  const buyerPage = await asRole(browser, 'buyer');
  await buyerPage.goto(`/checkout/new?listing=${listing.id}`);
  await buyerPage.getByLabel('עיר').selectOption('תל אביב-יפו');
  await buyerPage.getByLabel('רחוב ומספר').fill('רחוב המסירה 8');
  await buyerPage.getByTestId('checkout-submit').click();
  await buyerPage.waitForURL(/\/pay\/mock\//);
  await buyerPage.getByTestId('mock-pay-success').click();
  await buyerPage.waitForURL(/\/success/);

  const orderId = (await latestOrderForListing(listing.id))!;

  const sellerPage = await asRole(browser, 'seller');
  await sellerPage.goto(`/dashboard/seller/orders/${orderId}`);
  const dates = sellerPage.locator('select[aria-label^="תאריך"]');
  const shifts = sellerPage.locator('select[aria-label^="שעות"]');
  for (const index of [0, 1]) {
    const value = await dates.nth(index).locator('option').nth(index + 1).getAttribute('value');
    await dates.nth(index).selectOption(value!);
    await shifts.nth(index).selectOption('morning');
  }
  await sellerPage.getByTestId('confirm-submit').click();
  await expect(sellerPage.getByTestId('confirm-sale')).toBeHidden();

  await adminPage.goto(`/admin/orders/${orderId}`);
  const pickupDate = await selectByIndex(adminPage, '#pickup-date', 0);
  await selectByIndex(adminPage, '#pickup-shift', 0);
  await adminPage.locator('#dropoff-date').selectOption(pickupDate);
  await selectByIndex(adminPage, '#dropoff-shift', -1);
  await adminPage.getByLabel('שם הצוות').fill('צוות בדיקה');
  await adminPage.getByLabel('טלפון הצוות').fill('050-7654321');
  await adminPage.getByTestId('schedule-submit').click();

  // The crew finds the item does not match the listing. This is the mechanism
  // that makes buyer protection real rather than a marketing claim. [D-12]
  await adminPage.getByLabel('הערת בדיקה').fill('הספה קרועה בצד — לא תואם למודעה');
  await adminPage.getByTestId('mark-inspection-failed').click();

  // Poll the terminal state as a whole, not one field of it. The action writes
  // the cancellation first and the refund amount two statements later, so
  // polling on `status` alone can return while `refund_agorot` is still 0.
  await expect(async () => {
    const order = await getOrder(orderId);
    expect(order?.status).toBe('cancelled');
    // The buyer received nothing, so the refund is the full amount — not partial.
    expect(Number(order?.refund_agorot)).toBe(Number(order?.total_agorot));
    expect(await getListingStatus(listing.id)).toBe('active');
  }).toPass({ timeout: 10_000 });

  const events = (await getOrderEvents(orderId)).map((e) => e.type);
  expect(events).toContain('inspection_failed');
  expect(events).toContain('refund_issued');
});
