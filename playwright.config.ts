import { defineConfig, devices } from '@playwright/test';

import { existsSync } from 'node:fs';

/**
 * One thing owns the server.
 *
 * `E2E_BASE_URL` is set by whoever is already serving the app — today that is
 * the release gate, which starts `next start` itself so that Lighthouse, axe
 * and the contrast probe all measure the same process. When it is set, this
 * config must reuse that origin rather than race it for the port.
 *
 * `reuseExistingServer: !process.env.CI` alone was wrong in the way that only
 * shows up on a runner: locally it reused the gate's server and everything
 * passed, and in CI it refused, so the gate failed with "127.0.0.1:3210 is
 * already used" against a server the gate had just started on purpose.
 *
 * The port is derived from the URL rather than read separately, so `command`
 * and `url` cannot name different ports — the same "two things setting one
 * fact" defect as the duplicated security headers in [D-76].
 */
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? 3100}`;
const PORT = Number(new URL(BASE_URL).port || 3100);
const SERVER_IS_OWNED_ELSEWHERE = Boolean(process.env.E2E_BASE_URL);

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
      // Everything except the one spec that pauses a shared seller's whole
      // catalogue. See below. [D-95]
      testIgnore: /seller-pause\.admin\.spec\.ts/,
    },
    /**
     * Last, and on its own.
     *
     * `seller-pause` drives the seller-timeout cron, and `pause_seller_listings`
     * pauses **every** active listing the seller has — that is the feature, not
     * a bug in it `[D-74]`. But the seller it pauses is `SELLER_ID`, the default
     * that `createListing` gives every fixture in the suite, so while this file
     * runs, any other spec's freshly created listing can be paused underneath
     * it. That is exactly what happened: the lifecycle spec approved a listing,
     * read it back and got `paused`, on a run where the two files happened to
     * share the two workers. Intermittent, and invisible until the assertion
     * printed the received value.
     *
     * Depending on the other four projects makes Playwright finish all of them
     * before this starts, so nothing it pauses belongs to a test still running.
     * `fullyParallel: false` keeps its own seven tests in one worker too — they
     * share one counter on one profile, and `beforeEach` resets it.
     */
    {
      name: 'admin-destructive',
      use: { ...devices['Desktop Chrome'], channel: undefined, storageState: '.auth/admin.json' },
      dependencies: ['anon', 'buyer', 'seller', 'admin'],
      testMatch: /seller-pause\.admin\.spec\.ts/,
      fullyParallel: false,
    },
  ],

  webServer: {
    command: `npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: SERVER_IS_OWNED_ELSEWHERE || !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
