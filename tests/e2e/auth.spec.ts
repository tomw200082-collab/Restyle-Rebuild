import { expect, test } from '@playwright/test';
import { USERS } from '../../db/seed-data';

/**
 * This spec signs an account *out*, and `supabase.auth.signOut()` defaults to
 * global scope — it revokes every refresh token that account holds, on every
 * device. The server client validates with `getUser()`, which asks the auth
 * server, so a revoked session stops working immediately rather than at expiry.
 *
 * It used to use `buyer@restyle.test`, which is the account `global.setup.ts`
 * saves to `.auth/buyer.json`. In CI the 52 anon specs run before the buyer
 * project, so this test signed that saved session out and all eleven buyer
 * specs then ran anonymously — each failing on whatever locator it reached
 * first, none of them mentioning the session.
 *
 * So: an actor nothing else holds a session for. `seller2` exists in the seed
 * and is used elsewhere only as a listing owner's id, never logged in.
 * A spec that mutates a shared fixture's auth state is a spec that breaks
 * every other spec using it. [D-85]
 */
const actor = USERS.find((u) => u.email === 'seller2@restyle.test')!;
const actorName = new RegExp(actor.email.split('@')[0]!);

test.describe('Gate 1 — auth round trip', () => {
  test('sign in, stay signed in across a navigation, then sign out', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('כתובת מייל').fill(actor.email);
    await page.getByLabel('סיסמה').fill(actor.password);
    await page.getByRole('button', { name: 'כניסה', exact: true }).click();

    await page.waitForURL('/');
    const menu = page.getByRole('button', { name: actorName });
    await expect(menu).toBeVisible();

    // The session must survive a full navigation, not just the redirect.
    await page.reload();
    await expect(page.getByRole('button', { name: actorName })).toBeVisible();

    // An authenticated visit to /login must bounce home rather than re-prompt.
    await page.goto('/login');
    await page.waitForURL('/');

    await page.getByRole('button', { name: actorName }).click();
    await page.getByRole('menuitem', { name: 'יציאה' }).click();

    await expect(page.getByRole('link', { name: 'כניסה' })).toBeVisible();
  });

  test('a wrong password is rejected without revealing whether the account exists', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('כתובת מייל').fill(actor.email);
    await page.getByLabel('סיסמה').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'כניסה', exact: true }).click();

    // Scoped by test id rather than by role: Next renders its own
    // role="alert" route announcer, so getByRole('alert') is ambiguous.
    const error = page.getByTestId('login-error');
    await expect(error).toBeVisible();
    // The same message must appear for an unknown address, or the form becomes
    // an account-enumeration oracle.
    const wrongPasswordMessage = await error.textContent();

    await page.getByLabel('כתובת מייל').fill('nobody-here@restyle.test');
    await page.getByRole('button', { name: 'כניסה', exact: true }).click();
    await expect(page.getByTestId('login-error')).toHaveText(wrongPasswordMessage!.trim());
  });
});
