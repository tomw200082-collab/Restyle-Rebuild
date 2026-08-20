/**
 * The release gate. The only path to L2.
 *
 *   npm run release-gate                     full run against a server it starts
 *   npm run release-gate -- --fast           static stages only, for a quick signal
 *   npm run release-gate -- --base-url=URL   audit an already-running origin
 *   npm run release-gate -- --update-baselines
 *   npm run release-gate -- --no-append      do not write to the scorecard
 *
 * It **fails closed**. A stage that errors, times out, or cannot run is not a
 * pass; it is `fail` or `skipped`, and only `pass` on every stage produces a
 * `pass` verdict. Each run appends a dated entry to `quality/scorecard.json`,
 * which is committed so quality has a time series rather than an anecdote.
 *
 * Every stage is anchored to a defect class that has actually cost this project
 * time — see docs/decisions/ADR-001-restyle-governance.md. A stage that cannot
 * name the failure it prevents is a candidate for deletion.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { loadEnv } from './release-gate/env';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  buildStage,
  unitStage,
  rlsStage,
  e2eStage,
  jsonLdStage,
  hebrewCopyStage,
} from './release-gate/stages-static';
import {
  statusCodesStage,
  contrastStage,
  axeStage,
  lighthouseStage,
  screenshotStage,
  soldPageStage,
  sitemapStage,
  probeBrowser,
} from './release-gate/stages-browser';
import type { GateContext, Scorecard, ScorecardEntry, Stage, StageResult } from './release-gate/types';
import { ALLOWED_SKIPS } from './release-gate/types';

const ROOT = process.cwd();
const SCORECARD_PATH = join(ROOT, 'quality', 'scorecard.json');

/**
 * Order matters. Cheap stages first so a typecheck error costs seconds rather
 * than a full browser pass, and the server is only started once the code that
 * would run in it is known to compile.
 */
const STAGES: Stage[] = [
  buildStage,
  unitStage,
  rlsStage,
  e2eStage,
  jsonLdStage,
  hebrewCopyStage,
  statusCodesStage,
  contrastStage,
  axeStage,
  lighthouseStage,
  screenshotStage,
  soldPageStage,
  sitemapStage,
];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const [, value] = hit.split('=');
  return value ?? '';
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function waitForServer(url: string, timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  return false;
}

async function startServer(port: number): Promise<ChildProcess> {
  const child = spawn('npx', ['next', 'start', '--port', String(port)], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  return child;
}

const ICON: Record<StageResult['status'], string> = { pass: '✓', fail: '✗', skipped: '–' };

async function main() {
  // Next loads .env.local itself; a plain tsx script does not. Without this the
  // gate would report "(no supabase url set)" and every database-sampled stage
  // would skip — a gate that skips most of itself because of a missing import
  // is exactly the silent green this whole file exists to prevent.
  const envLoaded = loadEnv();

  const fast = arg('fast') !== undefined;
  const updateBaselines = arg('update-baselines') !== undefined;
  const noAppend = arg('no-append') !== undefined;
  const externalBase = arg('base-url');
  const port = Number(arg('port') ?? 3210);

  const stamp = new Date().toISOString();
  const outDir = join(ROOT, 'quality', 'runs', stamp.replace(/[:.]/g, '-'));
  await mkdir(outDir, { recursive: true });

  const baseUrl = externalBase || `http://127.0.0.1:${port}`;
  const ctx: GateContext = { baseUrl, outDir, fast, updateBaselines };

  console.log('Restyle release gate');
  console.log(`  env      ${envLoaded.length ? envLoaded.join(', ') : '(process env only)'}`);
  console.log(`  target   ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(no supabase url set)'}`);
  console.log(`  base url ${baseUrl}`);
  console.log(`  evidence ${relative(ROOT, outDir)}`);
  console.log(`  mode     ${fast ? 'fast (static stages only)' : 'full'}\n`);

  const browser = fast ? { ok: false, detail: '--fast' } : await probeBrowser();
  if (!fast) console.log(`  browser  ${browser.detail}\n`);
  const results: StageResult[] = [];
  let server: ChildProcess | null = null;
  let serverUp = Boolean(externalBase);

  try {
    for (const stage of STAGES) {
      // The server is started lazily: right before the first stage that needs
      // an origin, and only if the build stage passed. Starting it up front
      // would serve the previous build when the current one is broken — the
      // exact "measurement describes a version that no longer exists" trap.
      const needsOrigin = stage.needsBrowser || ['status-codes', 'sold-200', 'sitemap-coverage'].includes(stage.id);
      if (needsOrigin && !serverUp && !fast) {
        const build = results.find((r) => r.id === 'build');
        if (build?.status === 'pass' && existsSync(join(ROOT, '.next'))) {
          server = await startServer(port);
          serverUp = await waitForServer(`${baseUrl}/`);
        }
      }

      // The JSON-LD validator is a standalone script that takes its origin from
      // the environment; the gate is the thing that knows which origin.
      if (serverUp) process.env.E2E_BASE_URL = baseUrl;

      const started = Date.now();
      let outcome: Omit<StageResult, 'id' | 'name' | 'durationMs'>;

      if (fast && (stage.needsBrowser || needsOrigin)) {
        outcome = { status: 'skipped', detail: '--fast: browser and origin stages not run', metrics: { reason: 'browser-unavailable' } };
      } else if (needsOrigin && !serverUp) {
        outcome = { status: 'skipped', detail: 'no server origin available', metrics: { reason: 'browser-unavailable' } };
      } else if (stage.needsBrowser && !browser.ok) {
        outcome = { status: 'skipped', detail: `no browser available: ${browser.detail}`, metrics: { reason: 'browser-unavailable' } };
      } else {
        try {
          outcome = await stage.run(ctx);
        } catch (error) {
          // An exception is a failure, never a skip. This is the fail-closed
          // rule at its most literal: a stage that blew up did not pass.
          outcome = {
            status: 'fail',
            detail: `stage threw: ${(error as Error).message}`,
            failures: [String((error as Error).stack ?? error).slice(0, 2000)],
          };
        }
      }

      const result: StageResult = {
        id: stage.id,
        name: stage.name,
        durationMs: Date.now() - started,
        ...outcome,
      };
      results.push(result);

      const seconds = (result.durationMs / 1000).toFixed(1);
      console.log(`${ICON[result.status]} ${stage.name.padEnd(38)} ${result.detail} (${seconds}s)`);
      for (const failure of result.failures?.slice(0, 5) ?? []) console.log(`    ${failure}`);
    }
  } finally {
    if (server && !server.killed) server.kill('SIGTERM');
  }

  const counts = {
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  };
  const verdict: 'pass' | 'fail' = counts.fail === 0 && counts.skipped === 0 ? 'pass' : 'fail';

  const entry: ScorecardEntry = {
    at: stamp,
    commit: git(['rev-parse', '--short', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    verdict,
    complete: counts.skipped === 0,
    counts,
    target: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'unknown',
    stages: results,
  };

  if (!noAppend) {
    let scorecard: Scorecard = { version: 1, entries: [] };
    if (existsSync(SCORECARD_PATH)) {
      scorecard = JSON.parse(await readFile(SCORECARD_PATH, 'utf8')) as Scorecard;
    }
    scorecard.entries.push(entry);
    await mkdir(join(ROOT, 'quality'), { recursive: true });
    await writeFile(SCORECARD_PATH, JSON.stringify(scorecard, null, 2) + '\n', 'utf8');
  }
  await writeFile(join(outDir, 'entry.json'), JSON.stringify(entry, null, 2) + '\n', 'utf8');

  console.log(`\n  ${counts.pass} passed · ${counts.fail} failed · ${counts.skipped} skipped`);

  const disallowed = results
    .filter((r) => r.status === 'skipped')
    .filter((r) => !ALLOWED_SKIPS.includes(String(r.metrics?.reason ?? '') as never));

  if (verdict === 'pass') {
    console.log('  VERDICT: pass — eligible for L2.');
  } else if (counts.fail === 0) {
    console.log('  VERDICT: fail (skips only) — NOT eligible for L2 on this run alone.');
    console.log('  A skipped stage is never a pass. Eligibility needs CI to have run these stages');
    console.log('  on this commit, and every skip reason to be in ALLOWED_SKIPS.');
    if (disallowed.length) {
      console.log(`  ${disallowed.length} skip(s) with a reason outside ALLOWED_SKIPS:`);
      for (const r of disallowed) console.log(`    ${r.id}: ${r.detail}`);
    }
  } else {
    console.log('  VERDICT: fail — not eligible for L2.');
  }
  console.log(`  scorecard: ${relative(ROOT, SCORECARD_PATH)}`);
  console.log(`  evidence:  ${relative(ROOT, outDir)}`);

  process.exit(counts.fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
