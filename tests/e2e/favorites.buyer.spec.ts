import { expect, test } from '@playwright/test';
import { TEL_AVIV_SOFA, seedListing } from '../fixtures/listings';

test.describe('Gate 2 — favourites', () => {
  test('a buyer can favourite an item and un-favourite it again', async ({ page }) => {
    const listing = seedListing(TEL_AVIV_SOFA);
    await page.goto(`/item/${listing.slug}`);

    const button = page.getByTestId('favorite-button');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'false');

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');

    // Survives a reload, i.e. it was actually persisted rather than held in state.
    await page.reload();
    await expect(page.getByTestId('favorite-button')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('favorite-button').click();
    await expect(page.getByTestId('favorite-button')).toHaveAttribute('aria-pressed', 'false');
  });
});
