import { expect, test } from '@playwright/test';
import {
  backdate,
  closeDb,
  createListing,
  getListingStatus,
  getOrder,
  getOrderEvents,
  latestOrderForListing,
  runCron,
} from '../fixtures/db';

test.afterAll(async () => {
  await closeDb();
});

test.describe('Gate 3 — purchase', () => {
  test('buy with mock pay: order awaits the seller, listing is reserved, money balances', async ({
    page,
  }) => {
    const listing = await createListing({ price_agorot: 100_000, city: 'תל אביב-יפו' });

    await page.goto(`/checkout/new?listing=${listing.id}`);
    await page.getByLabel('עיר').selectOption('חולון');
    await page.getByLabel('רחוב ומספר').fill('רחוב הבדיקה 5');

    // Zone A pickup, zone B dropoff -> the higher zone, ₪199.
    await expect(page.getByTestId('checkout-delivery')).toContainText('199');
    await expect(page.getByTestId('checkout-total')).toContainText('1,199');

    await page.getByTestId('checkout-submit').click();

    await page.waitForURL(/\/pay\/mock\//);
    await page.getByTestId('mock-pay-success').click();
    await page.waitForURL(/\/success/);
    await expect(page.getByTestId('checkout-success')).toBeVisible();

    const orderId = await latestOrderForListing(listing.id);
    expect(orderId).toBeTruthy();

    const order = await getOrder(orderId!);
    expect(order?.status).toBe('pending_seller_confirmation');
    expect(order?.paid_at).not.toBeNull();

    // The listing is reserved, not sold: the seller has not confirmed yet.
    expect(await getListingStatus(listing.id)).toBe('reserved');

    // The invariants the database also enforces.
    expect(Number(order!.commission_agorot) + Number(order!.seller_payout_agorot)).toBe(
      Number(order!.item_agorot),
    );
    expect(Number(order!.commission_agorot)).toBe(20_000); // 20% of ₪1,000

    const events = await getOrderEvents(orderId!);
    expect(events.map((e) => e.type)).toContain('order_created');
    expect(events.map((e) => e.type)).toContain('payment_captured');
  });

  test('a cancelled payment releases the listing and charges nothing', async ({ page }) => {
    const listing = await createListing();

    await page.goto(`/checkout/new?listing=${listing.id}`);
    await page.getByLabel('עיר').selectOption('תל אביב-יפו');
    await page.getByLabel('רחוב ומספר').fill('רחוב הבדיקה 9');
    await page.getByTestId('checkout-submit').click();

    await page.waitForURL(/\/pay\/mock\//);
    await page.getByTestId('mock-pay-cancel').click();
    await page.waitForURL(/\/cancelled/);

    const orderId = await latestOrderForListing(listing.id);
    const order = await getOrder(orderId!);
    expect(order?.status).toBe('cancelled');
    expect(order?.paid_at).toBeNull();

    // Back on the market: an abandoned checkout must not take supply off it.
    expect(await getListingStatus(listing.id)).toBe('active');
  });

  test('self-pickup costs the item price alone', async ({ page }) => {
    const listing = await createListing({
      price_agorot: 80_000,
      floor: 7,
      elevator: false,
      disassembly: true,
      allowSelfPickup: true,
    });

    await page.goto(`/checkout/new?listing=${listing.id}`);
    await page.getByTestId('self-pickup-option').click();

    // No crew means no delivery fee, no floor surcharge and no disassembly
    // charge — even though this listing would incur all three. [D-08]
    await expect(page.getByTestId('checkout-total')).toContainText('800');
    await expect(page.getByTestId('checkout-delivery')).toContainText('0');
  });
});

test.describe('Gate 3 — seller timeout', () => {
  test('an unconfirmed order past the window is cancelled and refunded, and re-running is a no-op', async ({
    page,
    baseURL,
  }) => {
    const listing = await createListing();

    await page.goto(`/checkout/new?listing=${listing.id}`);
    await page.getByLabel('עיר').selectOption('תל אביב-יפו');
    await page.getByLabel('רחוב ומספר').fill('רחוב הבדיקה 3');
    await page.getByTestId('checkout-submit').click();
    await page.waitForURL(/\/pay\/mock\//);
    await page.getByTestId('mock-pay-success').click();
    await page.waitForURL(/\/success/);

    const orderId = (await latestOrderForListing(listing.id))!;

    // 49 hours old against a 48-hour window. The job compares stored
    // timestamps, so this exercises the real query rather than a simulation.
    await backdate('orders', orderId, 'created_at', 49);

    const first = await runCron('seller-timeout', baseURL!);
    expect(first.processed).toBeGreaterThan(0);

    const order = await getOrder(orderId);
    expect(order?.status).toBe('cancelled');
    expect(Number(order?.refund_agorot)).toBe(Number(order?.total_agorot));
    expect(await getListingStatus(listing.id)).toBe('active');

    const events = await getOrderEvents(orderId);
    expect(events.map((e) => e.type)).toContain('seller_confirmation_timeout');
    expect(events.filter((e) => e.type === 'refund_issued')).toHaveLength(1);

    // Cron delivery is at-least-once. A second run must not refund twice.
    await runCron('seller-timeout', baseURL!);
    const after = await getOrderEvents(orderId);
    expect(after.filter((e) => e.type === 'refund_issued')).toHaveLength(1);
    expect((await getOrder(orderId))?.status).toBe('cancelled');
  });

  test('an unpaid abandoned checkout releases the listing', async ({ page, baseURL }) => {
    const listing = await createListing();

    await page.goto(`/checkout/new?listing=${listing.id}`);
    await page.getByLabel('עיר').selectOption('תל אביב-יפו');
    await page.getByLabel('רחוב ומספר').fill('רחוב הבדיקה 7');
    await page.getByTestId('checkout-submit').click();
    await page.waitForURL(/\/pay\/mock\//);

    // The buyer closes the tab. Without this job the listing stays reserved
    // forever — the failure the legacy reservation cleaner was meant to catch
    // before it was disabled. [LI 5]
    const orderId = (await latestOrderForListing(listing.id))!;
    expect(await getListingStatus(listing.id)).toBe('reserved');

    await backdate('orders', orderId, 'created_at', 1);
    await runCron('abandoned-checkout', baseURL!);

    expect((await getOrder(orderId))?.status).toBe('cancelled');
    expect(await getListingStatus(listing.id)).toBe('active');
  });
});
