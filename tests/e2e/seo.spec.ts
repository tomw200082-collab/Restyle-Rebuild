import { expect, test } from '@playwright/test';
import { closeDb, createListing } from '../fixtures/db';

/**
 * Gate 5 — the indexing contract.
 *
 * SEO is a correctness property here, not polish: a page that renders
 * beautifully and ships the wrong canonical is broken, and nothing about it
 * looks broken. These assertions are the only thing that would notice.
 */

test.afterAll(async () => {
  await closeDb();
});

test.describe('Gate 5 — indexing policy', () => {
  test('the unfiltered catalogue is indexable and canonical to itself', async ({ page }) => {
    await page.goto('/catalog');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/catalog$/);
    expect(await page.locator('meta[name="robots"]').count()).toBe(0);
  });

  test('a single category filter canonicalises onto the hub', async ({ page }) => {
    await page.goto('/catalog?category=sofas-armchairs');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/category\/sofas-armchairs$/,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('combined facets are noindex, nofollow — the combinatorics are unbounded', async ({
    page,
  }) => {
    await page.goto('/catalog?category=sofas-armchairs&condition=good');
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/);
    await expect(robots).toHaveAttribute('content', /nofollow/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/catalog$/);
  });

  test('dashboards are excluded from robots.txt along with every private surface', async ({
    request,
  }) => {
    const body = await (await request.get('/robots.txt')).text();
    for (const path of ['/admin', '/dashboard', '/checkout', '/pay', '/api']) {
      expect(body, `robots.txt should disallow ${path}`).toContain(`Disallow: ${path}`);
    }
    expect(body).toContain('Sitemap:');
  });
});

test.describe('Gate 5 — sitemap', () => {
  test('the index is served at /sitemap.xml and names its chunks', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');

    const body = await response.text();
    expect(body).toContain('<sitemapindex');
    expect(body).toMatch(/<loc>[^<]+\/sitemap\/0\.xml<\/loc>/);
  });

  test('a chunk lists real, absolute item URLs', async ({ request }) => {
    const body = await (await request.get('/sitemap/0.xml')).text();
    expect(body).toContain('<urlset');
    expect(body).toMatch(/<loc>https?:\/\/[^<]+\/item\/[^<]+<\/loc>/);
    expect(body).toMatch(/<loc>https?:\/\/[^<]+\/category\/[^<]+<\/loc>/);
  });

  test('an out-of-range chunk 404s rather than serving an empty urlset', async ({ request }) => {
    expect((await request.get('/sitemap/99.xml')).status()).toBe(404);
  });
});

test.describe('Gate 5 — structured data', () => {
  test('an item page carries a valid Product with an ILS decimal price', async ({ page }) => {
    const listing = await createListing({ price_agorot: 123_400 });
    await page.goto(`/item/${listing.slug}`);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const parsed = blocks.flatMap((raw) => {
      const value = JSON.parse(raw) as unknown;
      return Array.isArray(value) ? value : [value];
    }) as Array<Record<string, unknown>>;

    const product = parsed.find((block) => block['@type'] === 'Product');
    expect(product, 'no Product block on the item page').toBeTruthy();

    const offers = product!.offers as Record<string, unknown>;
    expect(offers.priceCurrency).toBe('ILS');
    // Google rejects a formatted price, and he-IL formatting hides directional
    // marks inside what looks like a plain string.
    expect(offers.price).toBe('1234.00');
    expect(product!.itemCondition).toBe('https://schema.org/UsedCondition');

    const crumbs = parsed.find((block) => block['@type'] === 'BreadcrumbList');
    const items = crumbs!.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((item) => item.position)).toEqual(
      items.map((_, index) => index + 1),
    );
  });

  test('the site-wide entities are emitted once, at the root', async ({ page }) => {
    await page.goto('/');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const parsed = blocks.flatMap((raw) => {
      const value = JSON.parse(raw) as unknown;
      return Array.isArray(value) ? value : [value];
    }) as Array<Record<string, unknown>>;

    expect(parsed.filter((b) => b['@type'] === 'Organization')).toHaveLength(1);
    expect(parsed.filter((b) => b['@type'] === 'WebSite')).toHaveLength(1);
  });
});

test.describe('Gate 5 — legacy redirects', () => {
  // Every one of these appears in emails already sent to real users. [LI 6]
  const cases: Array<[string, string]> = [
    ['/Catalog', '/catalog'],
    ['/HowItWorks', '/how-it-works'],
    ['/BuyerProtection', '/buyer-protection'],
    ['/PrivacyPolicy', '/privacy'],
    ['/CancellationPolicy', '/cancellation-policy'],
    ['/UploadItem', '/sell/new'],
    ['/SellerDashboard', '/dashboard/seller'],
    ['/AdminV2?screen=orders', '/admin/orders'],
    // React Router matched case-insensitively, so both casings are indexed.
    ['/howitworks', '/how-it-works'],
    // An unmapped id still had intent: it goes to the catalogue, never a 404.
    ['/ItemDetails?id=ffffffffffffffffffffffff', '/catalog'],
  ];

  for (const [legacy, expected] of cases) {
    test(`301s ${legacy}`, async ({ request }) => {
      // Asserted on the redirect itself rather than the final URL: several of
      // these land on authenticated pages, which bounce an anonymous visitor to
      // /login. That bounce is correct, and it is not what this test is about —
      // following it would hide whether the 301 was even a 301.
      const response = await request.get(legacy, { maxRedirects: 0 });
      expect(response.status(), `${legacy} should be a permanent redirect`).toBe(301);
      expect(new URL(response.headers().location!, 'http://x').pathname).toBe(expected);
    });
  }
});

test.describe('Gate 5 — content pages', () => {
  test('the corrected protection window is published, not the legacy 12 hours', async ({ page }) => {
    await page.goto('/buyer-protection');
    await expect(page.getByText('48 שעות מרגע המסירה')).toBeVisible();
    await expect(page.getByText('12 שעות מרגע המסירה')).toHaveCount(0);
  });

  test('the terms publish the same 48-hour window the code enforces', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByText('בתוך 48 שעות ממועד המסירה')).toBeVisible();
    await expect(page.getByText('בתוך 12 שעות ממועד המסירה')).toHaveCount(0);
  });

  test('the privacy policy no longer names processors that do not receive the data', async ({
    page,
  }) => {
    await page.goto('/privacy');
    const body = await page.locator('main').innerText();
    for (const processor of ['PAYME', 'Tranzila', 'Morning']) {
      expect(body, `privacy policy should not name ${processor}`).not.toContain(processor);
    }
  });

  test('how it works shows both tracks and every FAQ is in the structured data', async ({
    page,
  }) => {
    await page.goto('/how-it-works');
    await expect(page.getByRole('tab', { name: 'אני רוצה למכור' })).toBeVisible();

    await page.getByRole('tab', { name: 'אני רוצה לקנות' }).click();
    await expect(page.getByText('הדרך שלכם לרהיט המושלם')).toBeVisible();

    const raw = await page.locator('script[type="application/ld+json"]').last().textContent();
    const faq = JSON.parse(raw!) as { mainEntity: Array<{ name: string }> };
    // Both tracks' questions, even though only one track is visible at a time.
    expect(faq.mainEntity.length).toBe(8);
  });
});
