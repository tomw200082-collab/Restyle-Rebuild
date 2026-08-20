import { expect, test } from '@playwright/test';

/**
 * Gate 6 — the things that are only visible when they are missing.
 */

test.describe('Gate 6 — security headers', () => {
  test('every response carries the baseline headers', async ({ request }) => {
    const headers = (await request.get('/')).headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    // Next advertises its own presence otherwise, which is free reconnaissance.
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('the CSP blocks framing, plugins, base hijacking and form exfiltration', async ({
    request,
  }) => {
    const csp = (await request.get('/')).headers()['content-security-policy'];
    expect(csp).toBeTruthy();

    for (const directive of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "default-src 'self'",
    ]) {
      expect(csp, `CSP should contain ${directive}`).toContain(directive);
    }
  });

  test('connect-src names the Supabase origin the browser client actually calls', async ({
    request,
    baseURL,
  }) => {
    const csp = (await request.get('/')).headers()['content-security-policy']!;
    const connect = csp.split(';').find((d) => d.trim().startsWith('connect-src'))!;

    // A CSP that omits it does not fail loudly — sign-in and favourites just
    // stop working, with the reason only in the browser console.
    expect(connect).toContain(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321');
    // And over http it must not upgrade: that rewrites the same origin to https
    // and breaks it just as thoroughly.
    if (baseURL?.startsWith('http://')) {
      expect(csp).not.toContain('upgrade-insecure-requests');
    }
  });
});

test.describe('Gate 6 — error surfaces', () => {
  test('an unknown URL renders the Hebrew 404 with a way back', async ({ page }) => {
    const response = await page.goto('/no-such-page-at-all');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('לא מצאנו את הדף הזה');
    await expect(page.getByRole('link', { name: 'לקטלוג' })).toBeVisible();
  });

  test('the 404 is not indexable, even though it renders like a page', async ({ request }) => {
    const html = await (await request.get('/no-such-page-at-all')).text();
    expect(html).toContain('noindex');
  });

  /**
   * Soft 404s are the failure this guards: a route-level `loading.tsx` opens a
   * Suspense boundary, Next starts streaming, the status is committed to 200,
   * and a later `notFound()` can only add a meta tag. The page looks correct
   * and Google indexes a "not found" page as real content.
   */
  for (const path of [
    '/item/definitely-not-a-real-slug-zzz999',
    '/category/no-such-category-zzz',
    '/category/sofas-armchairs/no-such-city-zzz',
    '/brand/no-such-brand-zzz',
  ]) {
    test(`${path} returns a real 404, not a soft one`, async ({ request }) => {
      expect((await request.get(path)).status()).toBe(404);
    });
  }
});

test.describe('Gate 6 — open redirect', () => {
  // The auth callback sends the user wherever `next` says. Left unguarded it is
  // a phishing primitive: a real restyle.co.il link that lands on a fake login.
  const hostile = [
    '//evil.example',
    'https://evil.example',
    '/\\evil.example',
    '\\\\evil.example',
  ];

  for (const next of hostile) {
    test(`refuses to bounce to ${next}`, async ({ request }) => {
      const response = await request.get(
        `/auth/callback?next=${encodeURIComponent(next)}`,
        { maxRedirects: 0 },
      );

      const location = response.headers().location ?? '';
      expect(location, `${next} must not become an off-site redirect`).not.toContain(
        'evil.example',
      );
    });
  }
});
