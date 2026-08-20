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
