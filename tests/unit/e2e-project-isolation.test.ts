import { describe, expect, it } from 'vitest';
import config from '../../playwright.config';

/**
 * Regression test for [D-95].
 *
 * `seller-pause.admin.spec.ts` drives the seller-timeout cron, and
 * `pause_seller_listings` pauses **every** active listing its seller has — by
 * design [D-74]. The seller is `SELLER_ID`, which `createListing` gives every
 * fixture in the suite, so while that file runs it can pause a listing another
 * spec is in the middle of asserting on. It did: the lifecycle spec approved a
 * listing, read it back and got `paused`, on three runs out of six.
 *
 * Ordering removes the overlap outright — Playwright finishes a project's
 * dependencies before starting it. That guarantee is the fix, and it lives in
 * config, where nothing else would notice it being undone. A future project
 * added to the config, or a `testIgnore` dropped, would silently restore a
 * 50/50 failure that took three wrong diagnoses to read the first time.
 */

const DESTRUCTIVE = 'tests/e2e/seller-pause.admin.spec.ts';

const projects = config.projects ?? [];
/** Playwright's own rule: testMatch admits, testIgnore then excludes. */
const admits = (p: (typeof projects)[number], file: string) => {
  const match = p.testMatch as RegExp | undefined;
  const ignore = p.testIgnore as RegExp | undefined;
  if (match && !match.test(file)) return false;
  if (ignore && ignore.test(file)) return false;
  return true;
};

describe('the destructive spec cannot run beside the specs it would disturb', () => {
  const owners = projects.filter((p) => p.name !== 'setup' && admits(p, DESTRUCTIVE));

  it('is claimed by exactly one project', () => {
    expect(
      owners.map((p) => p.name),
      'more than one project running this file puts it back in parallel with the rest',
    ).toEqual(['admin-destructive']);
  });

  it('waits for every other actor project before it starts', () => {
    const actors = projects
      .map((p) => p.name)
      .filter((name): name is string => Boolean(name) && name !== 'setup' && name !== 'admin-destructive');

    expect(
      owners[0]?.dependencies,
      'a project it does not depend on runs concurrently with it, and any listing ' +
        'that project creates for the shared seller can be paused underneath it',
    ).toEqual(expect.arrayContaining(actors));
  });

  it('runs its own tests in one worker — they share one counter on one profile', () => {
    expect(owners[0]?.fullyParallel).toBe(false);
  });

  it('finds the projects it is asserting about, so a renamed config cannot pass silently', () => {
    expect(projects.length).toBeGreaterThan(4);
    expect(projects.some((p) => p.name === 'setup')).toBe(true);
  });
});
