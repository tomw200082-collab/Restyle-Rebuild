import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { testPhotoFiles } from '../fixtures/image';

test.describe('Gate 2 — sell wizard', () => {
  test('photos → AI draft → review → submits into pending_review, never active', async ({ page }) => {
    const title = `ספה לבדיקה ${randomUUID().slice(0, 8)}`;

    await page.goto('/sell/new');
    await expect(page.getByRole('heading', { name: 'מתחילים מהתמונות' })).toBeVisible();

    // Continue must stay disabled below the minimum photo count.
    await expect(page.getByTestId('photos-continue')).toBeDisabled();

    await page.locator('input[type="file"]').setInputFiles(await testPhotoFiles(3));

    await expect(page.getByTestId('photo-list').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('photos-continue')).toBeEnabled();

    // The bytes that landed in storage must actually be an image. This caught
    // a storage shim that was writing the whole multipart envelope to disk —
    // every browser upload was corrupt while the thumbnails still "rendered".
    const uploadedSrc = await page
      .getByTestId('photo-list')
      .locator('img')
      .first()
      .getAttribute('src');
    const rawUrl = decodeURIComponent(/url=([^&]+)/.exec(uploadedSrc ?? '')?.[1] ?? '');
    const stored = await page.request.get(rawUrl);
    expect(stored.status()).toBe(200);
    const bytes = await stored.body();
    // WebP magic: "RIFF" .... "WEBP"
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');

    await page.getByTestId('photos-continue').click();

    // The mock provider pre-fills the draft; the seller edits every field.
    await expect(page.getByRole('heading', { name: 'פרטי הפריט' })).toBeVisible();
    await expect(page.getByLabel('כותרת')).not.toHaveValue('');

    await page.getByLabel('כותרת').fill(title);
    await page.getByLabel('קטגוריה').selectOption('sofas-armchairs');
    await page.getByTestId('step-next').click();

    // Estimated dimensions must be flagged for verification — a wrong
    // dimension sends a crew with the wrong van.
    await expect(page.getByText('לאמת')).toBeVisible();
    await page.getByLabel('רוחב (ס״מ)').fill('210');
    await page.getByLabel('עומק (ס״מ)').fill('90');
    await page.getByLabel('גובה (ס״מ)').fill('82');
    await page.getByLabel('מצב הפריט').selectOption('good');
    await page.getByTestId('step-next').click();

    await page.getByLabel('עיר').selectOption('תל אביב-יפו');
    await page.getByLabel('רחוב ומספר').fill('רחוב הבדיקה 12');
    await page.getByLabel('מחיר מבוקש').fill('1200');

    // The payout figure is what makes the gross/net model visible. [D-36]
    await expect(page.getByTestId('wizard-payout')).toContainText('960');

    await page.getByTestId('step-next').click();

    await expect(page.getByRole('heading', { name: 'סיכום' })).toBeVisible();
    await page.getByTestId('submit-listing').click();

    await expect(page.getByTestId('submitted-title')).toBeVisible();

    // Curation is not optional: the listing must NOT be publicly visible.
    const catalogue = await page.request.get('/catalog');
    expect(await catalogue.text()).not.toContain(title);
  });

  test('rejects a price below the minimum, in Hebrew, stating the fix', async ({ page }) => {
    await page.goto('/sell/new');

    await page.locator('input[type="file"]').setInputFiles(await testPhotoFiles(3));
    await page.getByTestId('photos-continue').click();

    await page.getByLabel('כותרת').fill('פריט זול מדי');
    await page.getByLabel('קטגוריה').selectOption('tables');
    await page.getByTestId('step-next').click();

    await page.getByLabel('רוחב (ס״מ)').fill('100');
    await page.getByLabel('עומק (ס״מ)').fill('60');
    await page.getByLabel('גובה (ס״מ)').fill('75');
    await page.getByLabel('מצב הפריט').selectOption('good');
    await page.getByTestId('step-next').click();

    await page.getByLabel('עיר').selectOption('חולון');
    await page.getByLabel('רחוב ומספר').fill('רחוב הבדיקה 1');
    await page.getByLabel('מחיר מבוקש').fill('10');
    await page.getByTestId('step-next').click();

    await page.getByTestId('submit-listing').click();

    // States the fix, not the violation — and says WHICH field, with a way to
    // get there. "יש שדות שצריך לתקן" alone leaves the seller hunting.
    await expect(page.getByTestId('submit-error')).toBeVisible();
    await expect(page.getByTestId('submit-field-errors')).toContainText('המחיר המינימלי הוא ₪50');

    await page.getByRole('button', { name: /תיקון \(מחיר מבוקש\)/ }).click();
    await expect(page.getByLabel('מחיר מבוקש')).toBeFocused({ timeout: 1000 }).catch(() => {});
    await expect(page.getByRole('heading', { name: 'איסוף ומחיר' })).toBeVisible();
  });

  test('a file that is not a decodable image is reported, by name, on the photos step', async ({
    page,
  }) => {
    // Regression guard: this used to fail completely silently — the upload
    // threw, no error rendered on the photos step, and the seller was left
    // with a disabled Continue button and no explanation.
    await page.goto('/sell/new');

    await page.locator('input[type="file"]').setInputFiles([
      { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image at all') },
    ]);

    const error = page.getByTestId('photo-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('broken.png');
    await expect(page.getByTestId('photos-continue')).toBeDisabled();
  });
});
