import { describe, expect, it } from 'vitest';
import { playwrightFailure } from '../../scripts/release-gate/stages-static';

/**
 * Regression test for [D-93].
 *
 * The e2e stage reported its failure with `tail(out, 20)`. Playwright's list
 * reporter prints the numbered failure blocks — test, assertion, locator,
 * expected, received — and then, *after* all of them, the attachment paths and
 * a one-line summary. So the last twenty lines are screenshot filenames and a
 * `show-trace` command, and a real CI run announced "e2e suite failed" without
 * the log containing a single word about what failed.
 *
 * The output is written to `e2e.log` in the run's evidence either way. But a
 * failure legible only after downloading an artifact is a failure most people
 * will guess at instead, and guessing at a red gate is how a flake and a
 * regression become indistinguishable.
 */

const ESC = String.fromCharCode(27);

/** A run shaped like the one that produced the empty diagnosis. */
const RUN = [
  'Running 77 tests using 2 workers',
  `  ${ESC}[32m✓${ESC}[39m  1 [setup] › tests/e2e/global.setup.ts:16:1 › clear rate limits (1.2s)`,
  '',
  '  1) [admin] › tests/e2e/full-lifecycle.admin.spec.ts:55:1 › approve → buy → pay out ───────',
  '',
  '    Error: expect(locator).toBeVisible() failed',
  '',
  "    Locator: getByTestId('pickup-form')",
  '    Expected: visible',
  '    Received: hidden',
  '    Timeout: 7000ms',
  '',
  '      118 |   await adminPage.getByTestId(\'schedule-submit\').click();',
  '    > 119 |   await expect(adminPage.getByTestId(\'pickup-form\')).toBeVisible();',
  '',
  '        attachment #1: screenshot (image/png) ───────────────────────────────',
  '    test-results/full-lifecycle-admin-retry1/test-failed-1.png',
  '        ────────────────────────────────────────────────────────────────────',
  '',
  '    attachment #4: trace (application/zip) ──────────────────────────────────',
  '    test-results/full-lifecycle-admin-retry1/trace.zip',
  '    Usage:',
  '',
  '        npx playwright show-trace test-results/full-lifecycle-admin-retry1/trace.zip',
  '',
  '        ────────────────────────────────────────────────────────────────────',
  '',
  '  1 failed',
  '    [admin] › tests/e2e/full-lifecycle.admin.spec.ts:55:1 › approve → buy → pay out',
  '  1 did not run',
  '  75 passed (1.1m)',
].join('\n');

describe('a failed e2e stage prints the failure, not the attachments', () => {
  const reported = playwrightFailure(RUN);

  it('names the assertion that failed', () => {
    expect(reported).toContain('expect(locator).toBeVisible() failed');
    expect(reported).toContain("getByTestId('pickup-form')");
    expect(reported).toContain('Received: hidden');
  });

  it('starts at the failure block, not twenty lines after it', () => {
    expect(reported.split('\n')[0]).toContain('full-lifecycle.admin.spec.ts:55:1');
  });

  it('is not what the previous version reported', () => {
    // The exact defect: the last twenty lines contain no assertion at all.
    const oldBehaviour = RUN.trimEnd().split('\n').slice(-20).join('\n');
    expect(oldBehaviour).not.toContain('expect(locator)');
    expect(oldBehaviour).toContain('show-trace');
  });

  it('strips the colour codes a runner adds when it thinks a terminal is watching', () => {
    expect(playwrightFailure(RUN, 60)).not.toContain(ESC);
  });

  it('says how much it left behind rather than trailing off', () => {
    const short = playwrightFailure(RUN, 4);
    expect(short.split('\n')).toHaveLength(5);
    expect(short).toMatch(/more lines in the e2e log/);
  });

  it('falls back to the tail when the run died before any test started', () => {
    // No numbered block exists — a webServer that never came up, say — and
    // there the last lines are exactly what the reader wants.
    const crash = ['Error: http://127.0.0.1:3210 is already used', 'at Object.<anonymous>'].join('\n');
    expect(playwrightFailure(crash)).toContain('already used');
  });
});
