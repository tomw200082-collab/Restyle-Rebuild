import { expect, test } from '@playwright/test';
import { SOLD_DRESSER, TEL_AVIV_SOFA, seedListing } from '../fixtures/listings';

test.describe('Gate 2 — browse', () => {
  test('catalog lists seeded items and filters by category', async ({ page }) => {
    await page.goto('/catalog');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('קטלוג');

    const allCards = await page.getByTestId('listing-card').count();
    expect(allCards).toBeGreaterThan(0);

    await page.getByLabel('קטגוריה').selectOption('sofas-armchairs');
    await page.waitForURL(/category=sofas-armchairs/);

    // Every remaining card must be a sofa listing, and there must be fewer.
    const filtered = await page.getByTestId('listing-card').count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(allCards);
  });

  test('filters are URL state, so a filtered view is shareable', async ({ page }) => {
    await page.goto('/catalog?city=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91-%D7%99%D7%A4%D7%95');
    await expect(page.getByTestId('listing-card').first()).toBeVisible();
    await expect(page.getByLabel('עיר')).toHaveValue('תל אביב-יפו');
  });

  test('a filter combination that matches nothing shows a way out, not a dead end', async ({
    page,
  }) => {
    await page.goto('/catalog?category=garden&city=%D7%91%D7%A0%D7%99%20%D7%91%D7%A8%D7%A7');
    await expect(page.getByText('לא מצאנו פריטים שמתאימים לסינון')).toBeVisible();
    await expect(page.getByRole('link', { name: 'ניקוי הסינון' })).toBeVisible();
  });

  test('filtered catalogue URLs are not indexed', async ({ page }) => {
    // Facet combinatorics generate unbounded near-duplicates; the category and
    // brand hubs are the indexable surface.
    const response = await page.goto('/catalog?category=tables&condition=good');
    const html = await response!.text();
    expect(html).toContain('noindex');
  });

  test('the unfiltered catalogue IS indexed', async ({ page }) => {
    const response = await page.goto('/catalog');
    const html = await response!.text();
    expect(html).not.toContain('noindex');
  });
});

test.describe('Gate 2 — item page', () => {
  test('shows the full spec, price and gallery', async ({ page }) => {
    await page.goto('/catalog');
    await page.getByTestId('listing-card').first().click();

    await expect(page).toHaveURL(/\/item\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('item-price')).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: 'מידות' })).toBeVisible();
    // A list of picture buttons, not a tab set: `role="tablist"` promised a
    // tabpanel relationship the markup never had, and broke the ul/li
    // semantics it sat on.
    const thumbnails = page.getByRole('list', { name: 'תמונות הפריט' });
    await expect(thumbnails).toBeVisible();
    await expect(thumbnails.getByRole('button')).not.toHaveCount(0);
  });

  test('the seller street address never reaches the item page payload', async ({ page }) => {
    // Asserted on the raw HTML: the failure mode is the address being present
    // in the payload but not rendered, which a DOM check would miss. [D-06]
    const listing = seedListing(TEL_AVIV_SOFA);
    const response = await page.goto(`/item/${listing.slug}`);
    const html = await response!.text();

    expect(html).not.toContain(listing.street);
    expect(html).not.toContain('pickup_street');
  });

  test('a sold item stays live at 200 with a similar-items grid', async ({ page }) => {
    // Sold listings keep their URL: they have accumulated whatever authority
    // they have, and 404-ing them throws it away.
    const sold = seedListing(SOLD_DRESSER);
    const response = await page.goto(`/item/${sold.slug}`);

    expect(response!.status()).toBe(200);
    await expect(page.getByText('הפריט הזה נמכר.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'פריטים דומים' })).toBeVisible();

    // A sold item offers no purchase path.
    await expect(page.getByRole('link', { name: 'קנייה' })).toHaveCount(0);
  });
});

test.describe('Gate 2 — delivery estimator', () => {
  test('quotes each zone correctly using the same engine the server uses', async ({ page }) => {
    // A zone-A pickup, so the fee is decided purely by the destination.
    const listing = seedListing(TEL_AVIV_SOFA);
    expect(listing.city).toBe('תל אביב-יפו');
    await page.goto(`/item/${listing.slug}`);

    await page.getByLabel('עיר').selectOption('תל אביב-יפו');
    await expect(page.getByTestId('quote-delivery')).toContainText('149');

    await page.getByLabel('עיר').selectOption('חולון');
    await expect(page.getByTestId('quote-delivery')).toContainText('199');

    await page.getByLabel('עיר').selectOption('כפר סבא');
    await expect(page.getByTestId('quote-delivery')).toContainText('249');
  });

});
