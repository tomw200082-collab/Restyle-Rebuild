import { describe, expect, it } from 'vitest';

/**
 * Regression test for [D-71].
 *
 * The gate's unit stage read its test count with `Number(match?.[1] ?? 0)` and
 * reported the result as a **pass**. In CI, vitest colourises its summary, the
 * escape codes land between the label and the number, the pattern found
 * nothing, and the stage announced "0 unit tests passed" — green, with a count
 * that should have been impossible.
 *
 * That is precisely the silent-green class the release gate exists to catch,
 * produced by the gate itself. Two properties are pinned here:
 *
 *   1. the pattern survives a colourised summary;
 *   2. an unreadable count throws rather than degrading to zero.
 *
 * The helpers are re-declared rather than imported because `stages-static.ts`
 * pulls in the whole gate at module load. The contract under test is the
 * regex-plus-guard pair, and duplicating six lines is cheaper than exporting an
 * internal for a test to reach — see restyle-yagni.
 */

const ESC = String.fromCharCode(27);
const ANSI = /\u001b\[[0-9;]*m/g;
const VITEST = /Tests\s+(\d+)\s+passed/;
const PLAYWRIGHT = /(\d+)\s+passed/;

function requireCount(output: string, pattern: RegExp, what: string): number {
  const match = pattern.exec(output.replace(ANSI, ''));
  const count = Number(match?.[1]);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(
      `could not read a ${what} count from the runner's output — refusing to report a pass without one`,
    );
  }
  return count;
}

describe('gate count parsing', () => {
  it('reads a plain vitest summary', () => {
    expect(requireCount(' Tests  85 passed (85)', VITEST, 'unit test')).toBe(85);
  });

  it('reads a colourised vitest summary — the exact shape that failed in CI', () => {
    const coloured = ` Tests  ${ESC}[1m${ESC}[32m85 passed${ESC}[39m${ESC}[22m (85)`;

    // Without stripping, the old pattern finds nothing. This is the bug.
    expect(VITEST.exec(coloured)).toBeNull();

    expect(requireCount(coloured, VITEST, 'unit test')).toBe(85);
  });

  it('reads a colourised playwright summary', () => {
    expect(requireCount(`  ${ESC}[32m69 passed${ESC}[39m (1.2m)`, PLAYWRIGHT, 'e2e test')).toBe(69);
  });

  it('throws when no count is present, instead of reporting a pass with zero', () => {
    expect(() => requireCount('everything is fine, honestly', VITEST, 'unit test')).toThrow(
      /refusing to report a pass without one/,
    );
  });

  it('throws on a zero count — a suite that ran nothing has proved nothing', () => {
    expect(() => requireCount(' Tests  0 passed (0)', VITEST, 'unit test')).toThrow(
      /refusing to report a pass/,
    );
  });

  it('throws on empty output — a runner that printed nothing measured nothing', () => {
    expect(() => requireCount('', VITEST, 'unit test')).toThrow();
  });
});

/**
 * Regression test for [D-86].
 *
 * The same stage later reported "74 e2e tests passed" on a run whose suite had
 * announced 77, while ci.yml ran all 77 green on the same commit. Two numbers
 * for one suite, and nothing to say which was right: `retries: 1` means a test
 * that fails and then passes is reported as **flaky**, not as passed, so the
 * headline count silently excludes it.
 *
 * The reconciliation is what makes the number mean something — the parts must
 * add up to the whole, or tests went missing and the stage has not passed
 * however green the exit code was.
 */
const ANNOUNCED = /Running\s+(\d+)\s+tests?/;

function accountFor(output: string) {
  const clean = output.replace(ANSI, '');
  const n = (pattern: RegExp) => Number(clean.match(pattern)?.[1] ?? 0);
  const passed = n(PLAYWRIGHT);
  const flaky = n(/(\d+)\s+flaky/);
  const skipped = n(/(\d+)\s+skipped/);
  const didNotRun = n(/(\d+)\s+did not run/);
  const announced = n(ANNOUNCED);
  return { announced, accounted: passed + flaky + skipped + didNotRun, passed, flaky };
}

describe('e2e counts reconcile against the suite total', () => {
  it('accounts for flaky tests, which the headline count leaves out', () => {
    const summary = `Running 77 tests using 2 workers\n\n  74 passed (2.9m)\n  3 flaky\n`;
    const r = accountFor(summary);
    expect(r.passed).toBe(74);
    expect(r.flaky).toBe(3);
    expect(r.accounted).toBe(r.announced);
  });

  it('reconciles a clean run where every test simply passed', () => {
    const r = accountFor('Running 77 tests using 2 workers\n\n  77 passed (1.4m)\n');
    expect(r.accounted).toBe(77);
    expect(r.accounted).toBe(r.announced);
  });

  it('reports a shortfall when tests vanish between the total and the summary', () => {
    // The case that must never be reported as a pass: the suite announced 77,
    // the summary accounts for 74, and nothing says where the other three went.
    const r = accountFor('Running 77 tests using 2 workers\n\n  74 passed (2.9m)\n');
    expect(r.accounted).not.toBe(r.announced);
    expect(r.announced - r.accounted).toBe(3);
  });

  it('survives a colourised summary, like its D-71 sibling', () => {
    const summary = `Running 77 tests using 2 workers\n\n  ${ESC}[32m74 passed${ESC}[39m (2.9m)\n  ${ESC}[33m3 flaky${ESC}[39m\n`;
    const r = accountFor(summary);
    expect(r.accounted).toBe(77);
  });
});
