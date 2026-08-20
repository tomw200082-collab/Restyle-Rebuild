import { expect, test } from '@playwright/test';
import { closeDb, createListing } from '../fixtures/db';

test.afterAll(async () => {
  await closeDb();
});

test.describe('Gate 2 — favourites', () => {
  /**
   * A listing created for this test alone.
   *
   * The shared seed row is read by other specs and written by this one, so in
   * a parallel run the button's starting state is whatever another worker last
   * left it as — the test then passes or fails depending on scheduling. Same
   * lesson as the offer spec in Phase 3: a mutating test owns its fixture.
   */
  test('a buyer can favourite an item and un-favourite it again', async ({ page }) => {
    const listing = await createListing();
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
