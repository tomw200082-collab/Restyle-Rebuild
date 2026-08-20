import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { USERS } from '../../db/seed-data';
import { closeDb, sql } from '../fixtures/db';

/**
 * The whole suite runs as three accounts, so it trips the per-user rate limits
 * long before a real person would — the buyer alone completes dozens of
 * checkouts against a limit of thirty an hour, and the failure looks like a
 * checkout that silently never redirects.
 *
 * The limits are right for production; it is the shared fixture accounts that
 * are unrealistic. Clearing the counters here is the same reasoning as
 * `db:reset`: test data should not accumulate into the next run.
 */
setup('clear rate limits', async () => {
  await sql('truncate table public.rate_limits');
  await closeDb();
});

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

    // Prove the file we just wrote actually restores a session.
    //
    // Asserting the login worked is not the same as asserting the *saved
    // state* works, and the difference is not theoretical: CI's first e2e run
    // had this setup pass and then every buyer spec fail on an unrelated
    // locator thirty seconds later, because the specs were running signed out.
    // Eleven timeouts named a select element; none of them named the session.
    //
    // A check that cannot read its own result has not passed [SPEC.md §10], so
    // the state is reloaded into a fresh context here and asked the same
    // question the login asked. If it fails, it fails once, in the setup, with
    // the role in the message.
    const restored = await browser.newContext({ storageState: `.auth/${role}.json` });
    try {
      const check = await restored.newPage();
      await check.goto('/');
      await expect(
        check.getByRole('button', { name: new RegExp(role) }),
        `.auth/${role}.json does not restore a signed-in session — every ${role} spec ` +
          `would run anonymously and fail on whatever locator it reached first`,
      ).toBeVisible();
    } finally {
      await restored.close();
    }
  }
});
