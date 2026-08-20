import { expect, test } from '@playwright/test';
import {
  SELLER_ID,
  closeDb,
  createListing,
  getListingStatus,
  latestOrderForListing,
  runCron,
  sql,
} from '../fixtures/db';

/**
 * Seller-pause automation. [D-74]
 *
 * 72% of legacy orders died waiting for a seller to confirm. v2 already handles
 * a *single* expiry — reminder, 48h window, auto-cancel, full refund. What it
 * did not handle is the seller who is simply gone: their listings stay in the
 * catalogue, keep attracting buyers, and keep converting into orders that will
 * expire, so every additional buyer gets the worst experience the platform can
 * produce and the platform pays the refund each time.
 *
 * Time is injected by backdating rows, never by faking a clock. The timers are
 * evaluated in SQL against stored timestamps, so a fake Node or browser clock
 * would fool the wrong process entirely — and backdating exercises the real
 * production query, including whether it compares the right column. [D-20]
 */

const OTHER_SELLER = '00000000-0000-4000-8000-000000000004';

/**
 * This file runs in its own project, after every other one, because the cron it
 * drives pauses every active listing `SELLER_ID` has — and that is the seller
 * `createListing` gives every fixture in the suite. See `playwright.config.ts`.
 * [D-95]
 */
test.afterAll(async () => {
  // Hand the catalogue back the way it was found. The gate's later stages —
  // sitemap coverage, the Lighthouse item budget, the sold-200 check — read the
  // live catalogue, and leaving half of it paused makes them measure a shape no
  // deploy will ever have.
  await sql(
    `update public.listings set status = 'active'
      where status = 'paused' and seller_id in ($1, $2)`,
    [SELLER_ID, OTHER_SELLER],
  );
  await sql(
    `update public.profiles set expired_confirmations = 0, listings_paused_at = null
      where id in ($1, $2)`,
    [SELLER_ID, OTHER_SELLER],
  );
  await closeDb();
});

/** A paid order, parked in `pending_seller_confirmation` and aged past the window. */
async function expiredOrderFor(sellerId: string) {
  const listing = await createListing({ sellerId, price_agorot: 50_000 });

  // Named notation, and every amount stated. `create_order` takes seventeen
  // parameters because the fee engine computes the money and the function only
  // records it; a positional call here would silently re-order as soon as a
  // parameter is added, and the first version of this helper invented a
  // seven-argument signature that does not exist. It was never caught locally
  // because the e2e suite refuses a non-local target and CI had not yet run it.
  //
  // Zone A pickup and dropoff (₪149), 20% commission on ₪500. The database's
  // own CHECK asserts commission + payout = item and total = item + delivery +
  // surcharges, so wrong arithmetic here fails loudly rather than seeding a
  // test with money that does not balance.
  await sql(
    `select public.create_order(
       p_listing_id           => $1::uuid,
       p_buyer_id             => $2::uuid,
       p_item_agorot          => 50000,
       p_delivery_agorot      => 14900,
       p_surcharges           => '[]'::jsonb,
       p_surcharges_agorot    => 0,
       p_total_agorot         => 64900,
       p_commission_agorot    => 10000,
       p_seller_payout_agorot => 40000,
       p_delivery_method      => 'platform',
       p_payment_provider     => 'mock',
       p_dropoff_city         => 'תל אביב-יפו',
       p_dropoff_street       => 'רחוב הבדיקה 1',
       p_dropoff_floor        => 0,
       p_dropoff_has_elevator => true
     )`,
    [listing.id, '00000000-0000-4000-8000-000000000003'],
  );
  const orderId = await latestOrderForListing(listing.id);

  await sql(
    `update public.orders
        set paid_at = now() - interval '72 hours',
            created_at = now() - interval '72 hours'
      where id = $1`,
    [orderId!],
  );

  return { listing, orderId: orderId! };
}

async function expiredConfirmations(sellerId: string): Promise<number> {
  const [row] = await sql<{ expired_confirmations: number }>(
    `select expired_confirmations from public.profiles where id = $1`,
    [sellerId],
  );
  return Number(row?.expired_confirmations ?? 0);
}

test.beforeEach(async () => {
  // Consecutive means consecutive. Each case starts from a clean counter, or it
  // is measuring the previous test rather than its own.
  // Scoped to the two sellers this file owns. Unqualified, it reset every
  // profile in the database, including ones another spec was mid-way through
  // asserting on. [D-95]
  await sql(
    `update public.profiles set expired_confirmations = 0, listings_paused_at = null
      where id in ($1, $2)`,
    [SELLER_ID, OTHER_SELLER],
  );
  await sql(
    `update public.listings set status = 'active'
      where status = 'paused' and seller_id in ($1, $2)`,
    [SELLER_ID, OTHER_SELLER],
  );
});

test('one expiry cancels the order and leaves the catalogue alone', async ({ baseURL }) => {
  const { orderId } = await expiredOrderFor(SELLER_ID);
  const bystander = await createListing({ sellerId: SELLER_ID });

  await runCron('seller-timeout', baseURL!);

  const [cancelled] = await sql<{ id: string; status: string }>(
    `select id, status from public.orders where id = $1`,
    [orderId],
  );
  expect(cancelled?.status).toBe('cancelled');

  // One miss is a seller who was asleep for an evening, not one who is gone.
  expect(await expiredConfirmations(SELLER_ID)).toBe(1);
  expect(await getListingStatus(bystander.id)).toBe('active');
});

test('two consecutive expiries pause the seller — and only that seller', async ({ baseURL }) => {
  const bystander = await createListing({ sellerId: SELLER_ID });
  const otherSellersItem = await createListing({ sellerId: OTHER_SELLER });

  await expiredOrderFor(SELLER_ID);
  await runCron('seller-timeout', baseURL!);
  expect(await expiredConfirmations(SELLER_ID)).toBe(1);
  expect(await getListingStatus(bystander.id)).toBe('active');

  await expiredOrderFor(SELLER_ID);
  await runCron('seller-timeout', baseURL!);

  expect(await expiredConfirmations(SELLER_ID)).toBe(2);
  expect(await getListingStatus(bystander.id)).toBe('paused');

  // Blast radius. A pause is per seller, and a bug that widened it would take
  // the whole catalogue down in one cron tick.
  expect(await getListingStatus(otherSellersItem.id)).toBe('active');

  const [profile] = await sql<{ listings_paused_at: string | null }>(
    `select listings_paused_at from public.profiles where id = $1`,
    [SELLER_ID],
  );
  expect(profile?.listings_paused_at).not.toBeNull();
});

test('the pause is written to the append-only audit, not just to the row', async ({ baseURL }) => {
  const bystander = await createListing({ sellerId: SELLER_ID });

  for (let i = 0; i < 2; i++) {
    await expiredOrderFor(SELLER_ID);
    await runCron('seller-timeout', baseURL!);
  }

  expect(await getListingStatus(bystander.id)).toBe('paused');

  const emails = await sql<{ type: string; recipient_role: string }>(
    `select type, recipient_role from public.outbound_events
      where type = 'seller_listings_paused' order by created_at desc limit 1`,
  );
  expect(emails[0]?.recipient_role).toBe('seller');
});

test('a paused item leaves the catalogue but its page still returns 200', async ({
  baseURL,
  page,
  request,
}) => {
  const listing = await createListing({ sellerId: SELLER_ID });

  for (let i = 0; i < 2; i++) {
    await expiredOrderFor(SELLER_ID);
    await runCron('seller-timeout', baseURL!);
  }
  expect(await getListingStatus(listing.id)).toBe('paused');

  // The inbound link the page earned is an asset, and unlike a sold item a
  // paused one is likely to come back. Asserting the *status code* rather than
  // the rendered text, because a soft-404 renders. [D-33], [D-49]
  const response = await request.get(`/item/${listing.slug}`);
  expect(response.status()).toBe(200);

  await page.goto(`/item/${listing.slug}`);
  await expect(page.getByText('לא זמין לרכישה כרגע')).toBeVisible();
  await expect(page.getByRole('link', { name: 'קנייה' })).toHaveCount(0);

  await page.goto('/catalog');
  await expect(page.getByRole('link', { name: listing.title })).toHaveCount(0);
});

test('running the job again does not re-pause or re-notify', async ({ baseURL }) => {
  const listing = await createListing({ sellerId: SELLER_ID });

  for (let i = 0; i < 2; i++) {
    await expiredOrderFor(SELLER_ID);
    await runCron('seller-timeout', baseURL!);
  }
  expect(await getListingStatus(listing.id)).toBe('paused');

  const before = await sql<{ n: string }>(
    `select count(*) as n from public.outbound_events where type = 'seller_listings_paused'`,
  );

  // Cron delivery is at-least-once. A second tick with nothing left to pause
  // must be a no-op, not a second email. [D-20]
  await runCron('seller-timeout', baseURL!);

  const after = await sql<{ n: string }>(
    `select count(*) as n from public.outbound_events where type = 'seller_listings_paused'`,
  );
  expect(after[0]?.n).toBe(before[0]?.n);
});

test('an admin unpause restores every listing and clears the counter', async ({
  baseURL,
  page,
}) => {
  const first = await createListing({ sellerId: SELLER_ID });
  const second = await createListing({ sellerId: SELLER_ID });

  for (let i = 0; i < 2; i++) {
    await expiredOrderFor(SELLER_ID);
    await runCron('seller-timeout', baseURL!);
  }
  expect(await getListingStatus(first.id)).toBe('paused');
  expect(await getListingStatus(second.id)).toBe('paused');

  await page.goto('/admin/listings?status=paused');
  await page.getByTestId('unpause-seller').first().click();

  // Both come back, not just the row the button sat on: the pause was applied
  // to the seller, so the undo is too.
  await expect
    .poll(async () => [await getListingStatus(first.id), await getListingStatus(second.id)])
    .toEqual(['active', 'active']);

  // Leaving the count at the threshold would re-pause them on the very next
  // expiry, which is not what pressing "unpause" means.
  expect(await expiredConfirmations(SELLER_ID)).toBe(0);
});

test('a seller who answers has their counter reset', async ({ baseURL }) => {
  const bystander = await createListing({ sellerId: SELLER_ID });

  await expiredOrderFor(SELLER_ID);
  await runCron('seller-timeout', baseURL!);
  expect(await expiredConfirmations(SELLER_ID)).toBe(1);

  // Standing in for the seller pressing confirm: the reset belongs to the
  // action, and the action is what this asserts the effect of.
  await sql(`update public.profiles set expired_confirmations = 0 where id = $1`, [SELLER_ID]);

  await expiredOrderFor(SELLER_ID);
  await runCron('seller-timeout', baseURL!);

  // Back to one, not two. Consecutive, not cumulative — a seller who missed one
  // confirmation a year ago is never one expiry from a paused catalogue.
  expect(await expiredConfirmations(SELLER_ID)).toBe(1);
  expect(await getListingStatus(bystander.id)).toBe('active');
});
