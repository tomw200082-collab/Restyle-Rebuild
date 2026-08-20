import { defineConfig, devices } from '@playwright/test';

import { existsSync } from 'node:fs';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Sandboxes and CI images often ship a Chromium whose build number does not
 * match the installed @playwright/test. Point at it when it exists; otherwise
 * fall back to Playwright's own download, so this config works unchanged on a
 * developer machine.
 */
const PROVIDED_CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const launchOptions = existsSync(PROVIDED_CHROMIUM)
  ? { executablePath: PROVIDED_CHROMIUM, args: ['--no-sandbox'] }
  : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A flaky test is a broken test: no retries locally so flake is visible.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    launchOptions,
  },

  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    // Anonymous is not an afterthought — it is where the privacy assertions live.
    {
      name: 'anon',
      use: {
        ...devices['Desktop Chrome'],
        channel: undefined,
        storageState: { cookies: [], origins: [] },
      },
      dependencies: ['setup'],
      testIgnore: /\.(buyer|seller|admin)\.spec\.ts/,
    },
    {
      name: 'buyer',
      use: { ...devices['Desktop Chrome'], channel: undefined, storageState: '.auth/buyer.json' },
      dependencies: ['setup'],
      testMatch: /\.buyer\.spec\.ts/,
    },
    {
      name: 'seller',
      use: { ...devices['Desktop Chrome'], channel: undefined, storageState: '.auth/seller.json' },
      dependencies: ['setup'],
      testMatch: /\.seller\.spec\.ts/,
    },
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], channel: undefined, storageState: '.auth/admin.json' },
      dependencies: ['setup'],
      testMatch: /\.admin\.spec\.ts/,
    },
  ],

  webServer: {
    command: `npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
