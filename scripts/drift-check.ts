/**
 * Schema drift check — does `supabase/migrations` still mirror the remote?
 *
 *   npm run drift-check
 *   npm run drift-check -- --json
 *
 * Builds a reference database from the migration files, runs `db/introspect.sql`
 * against both sides, and compares per-category digests over every object in
 * `public` and `private`.
 *
 * **File count is never the measurement.** Files and ledger rows can differ
 * legitimately — a correction applied remotely on its own and folded into an
 * existing file in the repository is one file, two ledger rows, and zero drift.
 * That exact case took two manual audits to re-establish before this existed.
 * See docs/RUN2_PLAN.md §2.
 *
 * Environment:
 *   REFERENCE_DATABASE_URL  a Postgres this may DROP and recreate a schema in
 *   SUPABASE_DB_URL         the remote, read-only here
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { loadEnv } from './release-gate/env';

const exec = promisify(execFile);
const ROOT = process.cwd();
const INTROSPECT = join(ROOT, 'db', 'introspect.sql');

type Digest = { kind: string; n: number; digest: string };

/**
 * Wraps `db/introspect.sql` so it emits one row per object category with a
 * count and an MD5 of the sorted, newline-joined object lines, plus a total.
 * Comparing 13 digests is the same assertion as diffing 920 lines, and it
 * survives being passed through a JSON transport.
 */
async function digestQuery(): Promise<string> {
  const source = await readFile(INTROSPECT, 'utf8');
  const body = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim()
    .replace(/;\s*$/, '');

  return `with objs as (
${body}
)
select split_part(obj,'|',1) as kind, count(*) as n, md5(string_agg(obj, E'\\n' order by obj)) as digest
from objs group by 1
union all
select 'ZZ_TOTAL', count(*), md5(string_agg(obj, E'\\n' order by obj)) from objs
order by 1;`;
}

async function psqlDigests(connectionString: string, sql: string): Promise<Digest[]> {
  const { stdout } = await exec('psql', [connectionString, '-tA', '-F', '|', '-c', sql], {
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [kind = '', n = '0', digest = ''] = line.split('|');
      return { kind, n: Number(n), digest };
    });
}

/** Rebuilds the reference database from the migration files, from scratch. */
async function buildReference(connectionString: string): Promise<number> {
  // A leftover schema from a previous run would be compared instead of the
  // migrations, which is the one thing this check must never do.
  await exec('psql', [
    connectionString,
    '-v', 'ON_ERROR_STOP=1',
    '-c', 'drop schema if exists public cascade; drop schema if exists private cascade; drop schema if exists auth cascade;',
    '-c', 'create schema public;',
  ], { timeout: 120_000 });

  const { stdout } = await exec(
    'npx',
    ['tsx', 'scripts/db-migrate.ts'],
    {
      cwd: ROOT,
      timeout: 600_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, DATABASE_URL: connectionString, DB_BOOTSTRAP: join(ROOT, 'db', 'local-bootstrap.sql') },
    },
  );
  return (stdout.match(/^applied /gm) ?? []).length;
}

async function main() {
  loadEnv();

  const asJson = process.argv.includes('--json');
  const reference = process.env.REFERENCE_DATABASE_URL ?? process.env.DATABASE_URL;
  const remote = process.env.SUPABASE_DB_URL;

  if (!reference) {
    console.error('REFERENCE_DATABASE_URL (or DATABASE_URL) is required — a Postgres this may rebuild.');
    process.exit(1);
  }
  if (!remote) {
    console.error('SUPABASE_DB_URL is required — the remote to compare against.');
    console.error('Supabase → Project Settings → Database → Connection string (URI).');
    process.exit(1);
  }

  const sql = await digestQuery();

  console.log('Building the reference database from supabase/migrations …');
  const applied = await buildReference(reference);
  console.log(`  ${applied} migration(s) applied.\n`);

  const [local, live] = await Promise.all([psqlDigests(reference, sql), psqlDigests(remote, sql)]);

  const kinds = [...new Set([...local.map((d) => d.kind), ...live.map((d) => d.kind)])].sort();
  const rows = kinds.map((kind) => {
    const a = local.find((d) => d.kind === kind);
    const b = live.find((d) => d.kind === kind);
    return {
      kind,
      repo: a ? { n: a.n, digest: a.digest } : null,
      remote: b ? { n: b.n, digest: b.digest } : null,
      match: Boolean(a && b && a.digest === b.digest),
    };
  });

  const drifted = rows.filter((r) => !r.match);
  const total = rows.find((r) => r.kind === 'ZZ_TOTAL');

  console.log('kind          repo   remote  match');
  for (const row of rows) {
    console.log(
      `${row.kind.padEnd(12)} ${String(row.repo?.n ?? '—').padStart(5)} ${String(row.remote?.n ?? '—').padStart(7)}   ${row.match ? '✓' : '✗'}`,
    );
  }
  console.log();

  const report = {
    at: new Date().toISOString(),
    objects: total?.repo?.n ?? 0,
    digest: total?.repo?.digest ?? '',
    remoteDigest: total?.remote?.digest ?? '',
    drifted: drifted.map((r) => r.kind),
    rows,
  };

  await mkdir(join(ROOT, 'quality'), { recursive: true });
  const out = join(ROOT, 'quality', 'drift-check.json');
  await writeFile(out, JSON.stringify(report, null, 2) + '\n', 'utf8');

  if (asJson) console.log(JSON.stringify(report, null, 2));

  if (drifted.length) {
    console.log(`DRIFT in ${drifted.length} categor${drifted.length === 1 ? 'y' : 'ies'}: ${drifted.map((r) => r.kind).join(', ')}`);
    console.log('');
    console.log('For each difference, decide which side is right. A remote-only object is');
    console.log('usually a hand-applied change that needs capturing as a migration; a');
    console.log('repo-only object is usually a migration that was never applied.');
    console.log('Never "fix" drift by editing an applied migration — a correction is always');
    console.log('a new migration. CLAUDE.md §4.');
    console.log(`\nevidence: ${relative(ROOT, out)}`);
    process.exit(1);
  }

  console.log(`No drift. ${report.objects} objects, identical on both sides (${report.digest}).`);
  console.log(`evidence: ${relative(ROOT, out)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
