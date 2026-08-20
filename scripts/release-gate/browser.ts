/**
 * Browser resolution for the gate.
 *
 * Playwright pins a browser revision per version and refuses to launch anything
 * else by default. Environments that ship a pre-installed Chromium — this
 * sandbox, and most hardened CI images — will therefore have a perfectly good
 * browser that Playwright will not use, and the gate would report
 * `browser-unavailable` for the six stages that matter most.
 *
 * So: try the pinned browser first, and fall back to whatever real Chromium is
 * on disk. `CHROMIUM_PATH` overrides both, which is how CI pins it explicitly.
 *
 * Resolution is reported, never silent. A gate that quietly measured a
 * different browser than it claimed would be its own silent-failure class.
 */
import { chromium, type Browser, type LaunchOptions } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BROWSER_ROOT = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';

/** Relative paths a Chromium build puts its binary at, newest layout first. */
const CANDIDATE_SUFFIXES = [
  join('chrome-linux', 'chrome'),
  join('chrome-linux64', 'chrome'),
  join('chrome-headless-shell-linux64', 'chrome-headless-shell'),
];

export type BrowserResolution = {
  available: boolean;
  /** 'pinned' when Playwright's own download was used. */
  source: 'pinned' | 'system' | 'env' | 'none';
  executablePath?: string;
  detail: string;
};

function discoverSystemChromium(): string | null {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }
  if (!existsSync(BROWSER_ROOT)) return null;

  // Prefer a full Chromium over a headless shell: the shell cannot do
  // screenshots of the kind the RTL stage needs.
  const dirs = readdirSync(BROWSER_ROOT)
    .filter((d) => d.startsWith('chromium'))
    .sort((a, b) => (a.includes('headless') ? 1 : 0) - (b.includes('headless') ? 1 : 0));

  for (const dir of dirs) {
    for (const suffix of CANDIDATE_SUFFIXES) {
      const full = join(BROWSER_ROOT, dir, suffix);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

let cached: BrowserResolution | null = null;

export async function resolveBrowser(): Promise<BrowserResolution> {
  if (cached) return cached;

  const tryLaunch = async (options: LaunchOptions): Promise<boolean> => {
    try {
      const browser = await chromium.launch(options);
      await browser.close();
      return true;
    } catch {
      return false;
    }
  };

  if (process.env.CHROMIUM_PATH && (await tryLaunch({ executablePath: process.env.CHROMIUM_PATH }))) {
    cached = {
      available: true,
      source: 'env',
      executablePath: process.env.CHROMIUM_PATH,
      detail: `CHROMIUM_PATH=${process.env.CHROMIUM_PATH}`,
    };
    return cached;
  }

  if (await tryLaunch({})) {
    cached = { available: true, source: 'pinned', detail: "Playwright's pinned Chromium" };
    return cached;
  }

  const system = discoverSystemChromium();
  if (system && (await tryLaunch({ executablePath: system }))) {
    cached = {
      available: true,
      source: 'system',
      executablePath: system,
      detail: `system Chromium at ${system} (Playwright's pinned revision is absent)`,
    };
    return cached;
  }

  cached = {
    available: false,
    source: 'none',
    detail: system
      ? `found ${system} but it failed to launch`
      : `no Chromium under ${BROWSER_ROOT}; run "npx playwright install chromium"`,
  };
  return cached;
}

/** Launch options that use whatever `resolveBrowser` settled on. */
export async function launchOptions(extra: LaunchOptions = {}): Promise<LaunchOptions> {
  const resolution = await resolveBrowser();
  return resolution.executablePath
    ? { ...extra, executablePath: resolution.executablePath }
    : { ...extra };
}

export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>, extra: LaunchOptions = {}): Promise<T> {
  const browser = await chromium.launch(await launchOptions(extra));
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
