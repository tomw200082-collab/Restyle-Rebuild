import { expect, test } from '@playwright/test';
import {
  closeDb,
  createListing,
  getListingStatus,
  getOrder,
  getOrderEvents,
  latestOrderForListing,
  runCron,
  sql,
} from '../fixtures/db';

test.afterAll(async () => {
  await closeDb();
});

/** Drives a purchase to the paid state and returns the order id. */
async function buyAndPay(
  page: import('@playwright/test').Page,
  listingId: string,
  offerId?: string,
) {
  const url = offerId
    ? `/checkout/new?listing=${listingId}&offer=${offerId}`
    : `/checkout/new?listing=${listingId}`;

  await page.goto(url);
  await page.getByLabel('עיר').selectOption('תל אביב-יפו');
  await page.getByLabel('רחוב ומספר').fill('רחוב הבדיקה 11');
  await page.getByTestId('checkout-submit').click();
  await page.waitForURL(/\/pay\/mock\//);
  await page.getByTestId('mock-pay-success').click();
  await page.waitForURL(/\/success/);

  return (await latestOrderForListing(listingId))!;
}

test.describe('Gate 3 — seller confirmation', () => {
  test('seller confirms with pickup windows and the order advances, audited', async ({
    page,
    browser,
  }) => {
    const listing = await createListing();
    const orderId = await buyAndPay(page, listing.id);

    // The seller acts in their own context — this is a two-actor journey.
    const sellerContext = await browser.newContext({ storageState: '.auth/seller.json' });
    const sellerPage = await sellerContext.newPage();

    await sellerPage.goto(`/dashboard/seller/orders/${orderId}`);
    await expect(sellerPage.getByTestId('confirm-sale')).toBeVisible();

    const dates = sellerPage.locator('select[aria-label^="תאריך"]');
    const shifts = sellerPage.locator('select[aria-label^="שעות"]');

    for (const index of [0, 1]) {
      const dateSelect = dates.nth(index);
      const value = await dateSelect.locator('option').nth(index + 1).getAttribute('value');
      await dateSelect.selectOption(value!);
      await shifts.nth(index).selectOption('morning');
    }

    await sellerPage.getByTestId('confirm-submit').click();
    await expect(sellerPage.getByTestId('confirm-sale')).toBeHidden();

    const order = await getOrder(orderId);
    expect(order?.status).toBe('confirmed');

    // Every transition leaves a trace, and both parties see the same history.
    const events = await getOrderEvents(orderId);
    const types = events.map((e) => e.type);
    expect(types).toContain('order_created');
    expect(types).toContain('payment_captured');
    expect(types).toContain('seller_confirmed');

    const [delivery] = await sql<{ proposed_windows: unknown[]; status: string }>(
      'select proposed_windows, status from public.deliveries where order_id = $1',
      [orderId],
    );
    expect(delivery?.proposed_windows).toHaveLength(2);
    expect(delivery?.status).toBe('unscheduled');

    await sellerContext.close();
  });

  test('the seller cannot skip states — delivered is unreachable from confirmed', async ({
    page,
  }) => {
    const listing = await createListing();
    const orderId = await buyAndPay(page, listing.id);

    // Asserted at the database, because that is where the guarantee lives:
    // no application bug, retry or manual fix can move an order illegally. [D-04]
    await expect(
      sql(`select public.transition_order($1, 'delivered')`, [orderId]),
    ).rejects.toThrow(/illegal order transition/);

    expect((await getOrder(orderId))?.status).toBe('pending_seller_confirmation');
  });
});

test.describe('Gate 3 — offers', () => {
  test('offer → accept → checkout at the agreed price, with commission on what was paid', async ({
    page,
    browser,
  }) => {
    const listing = await createListing({ price_agorot: 100_000 });

    await page.goto(`/item/${listing.slug}/offer`);
    // 60% of ₪1,000 is the floor; ₪700 clears it.
    await expect(page.getByTestId('offer-minimum')).toContainText('600');
    await page.getByLabel('הסכום שאתם מציעים').fill('700');
    await page.getByTestId('offer-submit').click();
    await page.waitForURL(/tab=offers/);

    const sellerContext = await browser.newContext({ storageState: '.auth/seller.json' });
    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto('/dashboard/seller?tab=offers');

    // Targeted by this listing's unique title: the suite runs in parallel and
    // other specs create offers too, so "the first card" is not this offer.
    const target = sellerPage.getByTestId('offer-card').filter({ hasText: listing.title });
    await expect(target).toHaveCount(1);
    await target.getByTestId('offer-accept').click();
    await expect(target.getByText('התקבלה')).toBeVisible();
    await sellerContext.close();

    // The listing stays active while the exclusive window is open: a lowball
    // offer must not take supply off the market for free. [D-15]
    expect(await getListingStatus(listing.id)).toBe('active');

    await page.goto('/dashboard/buyer?tab=offers');
    await page
      .getByTestId('offer-card')
      .filter({ hasText: listing.title })
      .getByTestId('offer-checkout')
      .click();
    await page.waitForURL(/\/checkout\/new/);

    await page.getByLabel('עיר').selectOption('תל אביב-יפו');
    await page.getByLabel('רחוב ומספר').fill('רחוב הבדיקה 11');

    // Priced at the agreed ₪700, not the ₪1,000 asking price.
    await expect(page.getByTestId('checkout-summary')).toContainText('700');
    await expect(page.getByTestId('checkout-total')).toContainText('849'); // 700 + 149 zone A

    await page.getByTestId('checkout-submit').click();
    await page.waitForURL(/\/pay\/mock\//);
    await page.getByTestId('mock-pay-success').click();
    await page.waitForURL(/\/success/);

    const orderId = (await latestOrderForListing(listing.id))!;
    const order = await getOrder(orderId);

    // Commission follows the price actually paid. Taxing the asking price
    // would raise the effective rate on every negotiated sale. [D-09]
    expect(Number(order!.item_agorot)).toBe(70_000);
    expect(Number(order!.commission_agorot)).toBe(14_000);
    expect(Number(order!.seller_payout_agorot)).toBe(56_000);
    expect(Number(order!.commission_agorot) + Number(order!.seller_payout_agorot)).toBe(
      Number(order!.item_agorot),
    );
  });

  test('an offer below the minimum is refused with the minimum stated', async ({ page }) => {
    const listing = await createListing({ price_agorot: 100_000 });

    await page.goto(`/item/${listing.slug}/offer`);
    await page.getByLabel('הסכום שאתם מציעים').fill('300');

    // Blocked client-side, and the message states the number rather than
    // just rejecting the input.
    await expect(page.getByText('ההצעה המינימלית היא')).toBeVisible();
    await expect(page.getByTestId('offer-submit')).toBeDisabled();
  });

  test('offers expire, and expiry is idempotent', async ({ page, baseURL }) => {
    const listing = await createListing({ price_agorot: 100_000 });

    await page.goto(`/item/${listing.slug}/offer`);
    await page.getByLabel('הסכום שאתם מציעים').fill('700');
    await page.getByTestId('offer-submit').click();
    await page.waitForURL(/tab=offers/);

    const [offer] = await sql<{ id: string }>(
      'select id from public.offers where listing_id = $1 order by created_at desc limit 1',
      [listing.id],
    );

    await sql(`update public.offers set expires_at = now() - interval '1 hour' where id = $1`, [
      offer!.id,
    ]);

    await runCron('offer-expiry', baseURL!);
    const [after] = await sql<{ status: string }>('select status from public.offers where id = $1', [
      offer!.id,
    ]);
    expect(after?.status).toBe('expired');

    await runCron('offer-expiry', baseURL!);
    const [again] = await sql<{ status: string }>('select status from public.offers where id = $1', [
      offer!.id,
    ]);
    expect(again?.status).toBe('expired');
  });
});
