/**
 * Stages that need neither a browser nor a running server.
 *
 * These are the cheap ones and they run first, so a typecheck error costs
 * seconds rather than a full browser pass.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { GateContext, Stage } from './types';

const exec = promisify(execFile);
const ROOT = process.cwd();

/** Caps the noise a broken build can produce in the scorecard. */
const MAX_FAILURES = 25;

async function npmRun(script: string, timeoutMs = 900_000) {
  return exec('npm', ['run', '--silent', script], {
    cwd: ROOT,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
}

function tail(text: string, lines = 20): string {
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}

function head(text: string, lines = 20): string {
  return text.trim().split('\n').slice(0, lines).join('\n');
}

/**
 * Test runners colourise their summary when they think a terminal is watching,
 * and GitHub Actions is one of the places they think that. The escape codes land
 * between the label and the number, so `/Tests\s+(\d+)/` matches locally and
 * finds nothing in CI.
 */
const ANSI = /\u001b\[[0-9;]*m/g;

/** CI runners colourise their summaries, and the escape codes land between the
 *  label and the number. [D-71] */
const stripAnsi = (output: string) => output.replace(ANSI, '');

/**
 * Parses a count out of a runner's summary, and **throws** when it cannot.
 *
 * The version of this that returned `?? 0` reported "0 unit tests passed" as a
 * green stage in CI — a pass, with a number that should have been impossible.
 * That is the silent-green class this whole gate exists to catch, produced by
 * the gate itself. A count that cannot be read is a stage that did not measure
 * anything, and a stage that did not measure anything has not passed.
 */
function requireCount(output: string, pattern: RegExp, what: string): number {
  const match = pattern.exec(stripAnsi(output));
  const count = Number(match?.[1]);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(
      `could not read a ${what} count from the runner's output — refusing to report a pass without one`,
    );
  }
  return count;
}

async function writeEvidence(ctx: GateContext, name: string, body: string): Promise<string> {
  await mkdir(ctx.outDir, { recursive: true });
  const path = join(ctx.outDir, name);
  await writeFile(path, body, 'utf8');
  return relative(ROOT, path);
}

export const buildStage: Stage = {
  id: 'build',
  name: 'build + typecheck + lint',
  needsBrowser: false,
  async run(ctx) {
    const parts: Array<[string, string]> = [
      ['typecheck', 'typecheck'],
      ['lint', 'lint'],
      ['build', 'build'],
    ];
    const logs: string[] = [];

    for (const [label, script] of parts) {
      try {
        const { stdout, stderr } = await npmRun(script);
        logs.push(`### ${label}\nOK\n${tail(stdout + stderr, 6)}`);
      } catch (error) {
        const err = error as { stdout?: string; stderr?: string; message?: string };
        const body = `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}`;
        logs.push(`### ${label}\nFAILED\n${body}`);
        const evidence = await writeEvidence(ctx, 'build.log', logs.join('\n\n'));
        // Head *and* tail. A linter names the file first and summarises last,
        // so a tail-only excerpt reports "185 errors" without saying in what —
        // which is exactly the shape of a CI failure that cannot be diagnosed
        // from the log.
        return {
          status: 'fail',
          detail: `${label} failed`,
          evidence: [evidence],
          failures: [head(body, 12), tail(body, 12)],
        };
      }
    }

    const evidence = await writeEvidence(ctx, 'build.log', logs.join('\n\n'));
    return { status: 'pass', detail: 'typecheck, lint and production build clean', evidence: [evidence] };
  },
};

export const unitStage: Stage = {
  id: 'unit',
  name: 'unit tests',
  needsBrowser: false,
  async run(ctx) {
    try {
      const { stdout, stderr } = await npmRun('test');
      const out = stdout + stderr;
      const evidence = await writeEvidence(ctx, 'unit.log', out);
      const passed = requireCount(out, /Tests\s+(\d+)\s+passed/, 'unit test');
      return {
        status: 'pass',
        detail: `${passed} unit tests passed`,
        metrics: { tests: passed },
        evidence: [evidence],
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim() || (err.message ?? '');
      const evidence = await writeEvidence(ctx, 'unit.log', out);
      return {
        status: 'fail',
        detail: err.stdout || err.stderr ? 'unit tests failed' : (err.message ?? 'unit tests failed'),
        evidence: [evidence],
        failures: [tail(out, 15)],
      };
    }
  },
};

export const rlsStage: Stage = {
  id: 'rls',
  name: 'RLS assertion suite',
  needsBrowser: false,
  async run(ctx) {
    // The suite needs a Postgres it is allowed to connect to as a superuser to
    // impersonate anon/authenticated. That is a local reference database, never
    // production — asserting RLS by trying to breach it is not something to run
    // against real rows.
    if (!process.env.DATABASE_URL) {
      return {
        status: 'skipped',
        detail: 'DATABASE_URL unset — the RLS suite needs a local reference database',
        metrics: { reason: 'rls-fixture-absent' },
      };
    }

    // The suite asserts each policy in both directions, which needs rows in
    // every status to assert against — `db/rls_test.sql` says so itself in its
    // first assertion. Probing for that precondition turns "RLS suite failed"
    // into "the database was not seeded", which are very different findings and
    // should never be reported as the same one.
    try {
      const { stdout } = await exec(
        'psql',
        [process.env.DATABASE_URL, '-tAc', "select count(*) from public.listings where status = 'active'"],
        { timeout: 30_000 },
      );
      if (Number(stdout.trim()) === 0) {
        return {
          status: 'skipped',
          detail: 'reference database has no seeded listings — run `npm run db:seed` first (CI seeds it)',
          metrics: { reason: 'rls-fixture-absent' },
        };
      }
    } catch (error) {
      return {
        status: 'skipped',
        detail: `cannot reach the reference database: ${(error as Error).message}`,
        metrics: { reason: 'rls-fixture-absent' },
      };
    }

    try {
      const { stdout, stderr } = await npmRun('db:rlstest');
      const out = stdout + stderr;
      const evidence = await writeEvidence(ctx, 'rls.log', out);
      const assertions = Number(/(\d+)\s+assertions?/i.exec(out)?.[1] ?? 0);
      return {
        status: 'pass',
        detail: assertions ? `${assertions} RLS assertions passed` : 'RLS suite passed',
        metrics: assertions ? { assertions } : {},
        evidence: [evidence],
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
      const evidence = await writeEvidence(ctx, 'rls.log', out);
      return { status: 'fail', detail: 'RLS suite failed', evidence: [evidence], failures: [tail(out, 15)] };
    }
  },
};

export const e2eStage: Stage = {
  id: 'e2e',
  name: 'end-to-end, four actor roles',
  needsBrowser: true,
  async run(ctx) {
    // The e2e suite signs up buyers, sellers and an admin, creates listings and
    // drives orders through to payout. Against the production project that
    // would be real users and real orders, so the guard is not "can it run" but
    // "is the target one we are allowed to write to". Only a localhost Supabase
    // origin qualifies. CI provides one with `supabase start`.
    const target = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const writable = /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal)(:|\/|$)/.test(target);
    if (!writable) {
      return {
        status: 'skipped',
        detail: `target ${target || '(unset)'} is not a local stack — refusing to run e2e against it (CI runs it)`,
        metrics: { reason: 'browser-unavailable' },
      };
    }
    try {
      const { stdout, stderr } = await npmRun('test:e2e');
      const out = stdout + stderr;
      const evidence = await writeEvidence(ctx, 'e2e.log', out);
      // Every test is accounted for, not just the passing ones.
      //
      // This stage reported "74 e2e tests passed" on a run where the suite
      // announced 77 and ci.yml ran all 77 green — two numbers for one suite on
      // one commit, and no way to tell whether three tests had been retried,
      // skipped, or silently dropped. `retries: 1` in CI means a test that
      // fails and then passes is reported as *flaky*, not as passed, so the
      // headline count quietly excludes it. [D-86]
      //
      // Reconciling against the suite's own "Running N tests" is what makes the
      // number mean something: if the parts do not add up to the whole, tests
      // went missing and that is a failure, however green the exit code was.
      const passed = requireCount(out, /(\d+)\s+passed/, 'e2e test');
      const optional = (pattern: RegExp) => Number(stripAnsi(out).match(pattern)?.[1] ?? 0);
      const flaky = optional(/(\d+)\s+flaky/);
      const skipped = optional(/(\d+)\s+skipped/);
      const didNotRun = optional(/(\d+)\s+did not run/);
      const interrupted = optional(/(\d+)\s+interrupted/);
      const announced = optional(/Running\s+(\d+)\s+tests?/);
      const accounted = passed + flaky + skipped + didNotRun + interrupted;

      if (announced && accounted !== announced) {
        return {
          status: 'fail',
          detail: `${announced} e2e tests announced, ${accounted} accounted for`,
          failures: [
            `passed ${passed}, flaky ${flaky}, skipped ${skipped}, did-not-run ${didNotRun}, ` +
              `interrupted ${interrupted} — ${announced - accounted} unaccounted for`,
          ],
          metrics: { tests: announced, passed, flaky, skipped },
          evidence: [evidence],
        };
      }

      const notes = [
        flaky ? `${flaky} flaky` : '',
        skipped ? `${skipped} skipped` : '',
        didNotRun ? `${didNotRun} did not run` : '',
      ].filter(Boolean);

      return {
        status: 'pass',
        detail: `${passed} e2e tests passed${notes.length ? ` (${notes.join(', ')})` : ''}`,
        metrics: { tests: announced || passed, passed, flaky, skipped },
        evidence: [evidence],
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim() || (err.message ?? '');
      const evidence = await writeEvidence(ctx, 'e2e.log', out);
      return {
        status: 'fail',
        detail: err.stdout || err.stderr ? 'e2e suite failed' : (err.message ?? 'e2e suite failed'),
        evidence: [evidence],
        failures: [tail(out, 20)],
      };
    }
  },
};

export const jsonLdStage: Stage = {
  id: 'jsonld',
  name: 'JSON-LD structured data',
  needsBrowser: false,
  async run(ctx) {
    // The validator asserts a Product block on a real item, reached by
    // following a link from /catalog. An empty catalogue has no link to follow,
    // which is a data precondition rather than a structured-data defect.
    const { activeListings } = await import('./target').then((m) => m.targetCounts());
    if (activeListings === 0) {
      return {
        status: 'skipped',
        detail: 'no active listings in the target database — no Product block to validate',
        metrics: { reason: 'no-listings-in-target-database' },
      };
    }
    try {
      const { stdout, stderr } = await npmRun('seo:validate');
      const out = stdout + stderr;
      const evidence = await writeEvidence(ctx, 'jsonld.log', out);
      return { status: 'pass', detail: 'structured data valid', evidence: [evidence] };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string };
      const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
      const evidence = await writeEvidence(ctx, 'jsonld.log', out);
      return { status: 'fail', detail: 'JSON-LD validation failed', evidence: [evidence], failures: [tail(out, 15)] };
    }
  },
};

/**
 * Hebrew copy lint — no English leakage in user-visible strings.
 *
 * The rule is one-directional and asymmetric on purpose. English inside a
 * Hebrew string is the defect; Hebrew inside code is caught by review. So this
 * looks only at JSX text nodes and the props that reach a user's eyes, and it
 * accepts a string that is *entirely* a proper noun, a number, or punctuation —
 * "WhatsApp", "₪149", "SEO" are not leakage.
 */
const UI_PROPS = ['placeholder', 'title', 'aria-label', 'alt', 'label'];

/** Latin words that are legitimate in Hebrew UI: brands, units, proper nouns. */
const ALLOWED_LATIN = new Set([
  'restyle', 'whatsapp', 'ikea', 'homecenter', 'google', 'facebook', 'instagram',
  'visa', 'mastercard', 'israel', 'ok', 'id', 'url', 'email', 'sms', 'pdf', 'png',
  'jpg', 'jpeg', 'webp', 'am', 'pm', 'cm', 'kg', 'gb', 'mb', 'ils', 'vat',
]);

/**
 * Operators and code punctuation. A JSX "text node" containing these is almost
 * always a comparison the naive `>...<` scan mistook for markup — `x > 0 && y`
 * reads as a text node between two brackets, and `Promise<void>` reads as one
 * after an arrow. Rejecting them here keeps the finding list short enough to be
 * read, which is the only reason a lint like this survives.
 */
const CODEISH = /[{}();=&|]|=>|\breturn\b/;

function isLeak(text: string, fromProp: boolean): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (CODEISH.test(trimmed)) return false;
  // A string with any Hebrew in it is a Hebrew string. Mixed content like
  // "משלוח עד הבית — IKEA" is normal and correct.
  if (/[\u0590-\u05FF]/.test(trimmed)) return false;
  // Pure punctuation, numbers, currency, entities.
  if (!/[A-Za-z]{2,}/.test(trimmed)) return false;
  // A bare identifier in a JSX position is a component or a type, not copy.
  // Inside a user-visible prop a single word genuinely can be copy, so the
  // rule only applies to text nodes.
  if (!fromProp && !/\s/.test(trimmed)) return false;

  const words = trimmed.toLowerCase().match(/[a-z]{2,}/g) ?? [];
  // Every Latin word being an allowed proper noun means this is a brand string,
  // not untranslated copy.
  return !words.every((w) => ALLOWED_LATIN.has(w));
}

export const hebrewCopyStage: Stage = {
  id: 'hebrew-copy',
  name: 'Hebrew copy lint',
  needsBrowser: false,
  async run(ctx) {
    const files: string[] = [];
    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (/\.tsx$/.test(entry.name)) {
          files.push(full);
        }
      }
    }
    await walk(join(ROOT, 'src'));

    const failures: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const lines = source.split('\n');

      lines.forEach((line, i) => {
        // JSX text nodes: >text< on one line, the common shape in this codebase.
        // The lookbehind rejects `=>`, `>=`, `->` and friends, so an arrow
        // function or a comparison is not mistaken for an opening tag.
        for (const match of line.matchAll(/(?<![=!<>+\-*/&|])>([^<>{}\n]{3,})</g)) {
          const text = match[1] ?? '';
          if (isLeak(text, false)) failures.push(`${relative(ROOT, file)}:${i + 1}: ${text.trim()}`);
        }
        // User-visible props.
        for (const prop of UI_PROPS) {
          const re = new RegExp(`${prop}=["']([^"']{3,})["']`, 'g');
          for (const match of line.matchAll(re)) {
            const text = match[1] ?? '';
            if (isLeak(text, true)) failures.push(`${relative(ROOT, file)}:${i + 1}: ${prop}="${text}"`);
          }
        }
      });
    }

    const evidence = await writeEvidence(
      ctx,
      'hebrew-copy.txt',
      failures.length ? failures.join('\n') : 'no English leakage found',
    );

    if (failures.length) {
      return {
        status: 'fail',
        detail: `${failures.length} English string(s) in the Hebrew UI`,
        failures: failures.slice(0, MAX_FAILURES),
        metrics: { leaks: failures.length, filesScanned: files.length },
        evidence: [evidence],
      };
    }
    return {
      status: 'pass',
      detail: `no English leakage across ${files.length} components`,
      metrics: { leaks: 0, filesScanned: files.length },
      evidence: [evidence],
    };
  },
};
