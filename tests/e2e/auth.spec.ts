import { expect, test } from '@playwright/test';
import { USERS } from '../../db/seed-data';

const buyer = USERS.find((u) => u.email === 'buyer@restyle.test')!;

test.describe('Gate 1 — auth round trip', () => {
  test('sign in, stay signed in across a navigation, then sign out', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('כתובת מייל').fill(buyer.email);
    await page.getByLabel('סיסמה').fill(buyer.password);
    await page.getByRole('button', { name: 'כניסה', exact: true }).click();

    await page.waitForURL('/');
    const menu = page.getByRole('button', { name: /buyer/ });
    await expect(menu).toBeVisible();

    // The session must survive a full navigation, not just the redirect.
    await page.reload();
    await expect(page.getByRole('button', { name: /buyer/ })).toBeVisible();

    // An authenticated visit to /login must bounce home rather than re-prompt.
    await page.goto('/login');
    await page.waitForURL('/');

    await page.getByRole('button', { name: /buyer/ }).click();
    await page.getByRole('menuitem', { name: 'יציאה' }).click();

    await expect(page.getByRole('link', { name: 'כניסה' })).toBeVisible();
  });

  test('a wrong password is rejected without revealing whether the account exists', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('כתובת מייל').fill(buyer.email);
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
