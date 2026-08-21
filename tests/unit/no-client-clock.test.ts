import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression test for [D-90].
 *
 * `ConfirmSale` and `AdminOrderActions` each computed their own date list with
 * `availableDates(new Date(), …)` inside a `'use client'` component. The server
 * renders that list from its clock; the browser recomputes from its own a
 * moment later. Either side of midnight the two disagree, React discards the
 * server's markup for the subtree and re-renders it, and the `<select>` the
 * user was operating detaches mid-interaction.
 *
 * It cost three CI runs at 00:06 Israel time before anyone looked at the clock;
 * the same suite had passed all morning. The calendar is now computed once, on
 * the server, and passed down as a prop.
 *
 * The check is a source scan rather than a rendered assertion because the
 * invariant *is* a source property — "no client component derives a date from
 * its own clock" — and proving it that way needs no React renderer.
 */

const COMPONENTS = join(process.cwd(), 'src', 'components');

/**
 * Comments are prose, not code. The first version of this check flagged
 * `confirm-sale.tsx` for the sentence in its own doc comment explaining why the
 * call had been removed — a lint that fails on its own documentation is the
 * `PreToolUse` mistake again, twice in one repository. [D-77]
 */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') || path.endsWith('.ts') ? [path] : [];
  });
}

describe('no client component derives the delivery calendar from its own clock', () => {
  const files = tsxFiles(COMPONENTS).map((path) => ({ path, source: readFileSync(path, 'utf8') }));

  it('finds components to check, so a broken walk cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.source.includes("'use client'"))).toBe(true);
  });

  it('never calls availableDates inside a client component', () => {
    const offenders = files
      .filter((f) => {
        const code = withoutComments(f.source);
        return code.includes("'use client'") && /\bavailableDates\s*\(/.test(code);
      })
      .map((f) => f.path.replace(process.cwd() + '/', ''));

    expect(
      offenders,
      'these run on both the server and the browser, so they compute two different ' +
        'calendars either side of midnight — take the dates as a prop instead [D-90]',
    ).toEqual([]);
  });
});
