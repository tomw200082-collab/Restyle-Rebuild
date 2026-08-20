import { expect, test } from '@playwright/test';

test.describe('Gate 1 — foundation', () => {
  test('home renders RTL, in Hebrew, with seeded listings', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('הרהיט הבא שלכם');
    await expect(page.getByTestId('listing-card').first()).toBeVisible();
  });

  test('header exposes the category navigation', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'קטגוריות' });
    await expect(nav.getByRole('link', { name: 'ספות וכורסאות' })).toBeVisible();
  });

  test('anonymous visitors are offered sign-in, not a session', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'כניסה' })).toBeVisible();
  });

  test('the seller street address never reaches the public page', async ({ page }) => {
    // Asserted against the raw response body rather than the rendered DOM: the
    // failure mode is the address being present in the payload but hidden by
    // CSS, which a DOM assertion would miss entirely. [D-06]
    const response = await page.goto('/');
    const html = await response!.text();

    for (const street of ['רחוב דיזנגוף 145', 'רחוב ביאליק 22', 'שדרות רוטשילד 60']) {
      expect(html).not.toContain(street);
    }
  });
});
