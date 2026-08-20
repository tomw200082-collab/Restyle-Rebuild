import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { USERS } from '../../db/seed-data';

/**
 * Authenticates once per actor and saves the storage state, so no other spec
 * ever logs in through the UI — except the one spec whose subject IS logging in.
 */
setup('authenticate actors', async ({ browser }) => {
  mkdirSync('.auth', { recursive: true });

  for (const role of ['buyer', 'seller', 'admin'] as const) {
    const user = USERS.find((u) => u.email === `${role}@restyle.test`);
    if (!user) throw new Error(`seed user missing for role ${role}`);

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');
    await page.getByLabel('כתובת מייל').fill(user.email);
    await page.getByLabel('סיסמה').fill(user.password);
    await page.getByRole('button', { name: 'כניסה', exact: true }).click();

    // Wait for the observable consequence, not for a network event.
    await page.waitForURL('/');
    await expect(page.getByRole('button', { name: new RegExp(role) })).toBeVisible();

    await context.storageState({ path: `.auth/${role}.json` });
    await context.close();
  }
});
