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


/**
 * psql, with the credentials in the environment instead of in argv. [D-89]
 *
 * A connection string on the command line is a password one bad character away
 * from a public log. It happened: a database password containing `%` made psql
 * reject the URI with `invalid percent-encoded token: "<the password>"`, and
 * GitHub's secret masking did not catch it, because the fragment psql quoted is
 * not the whole string the masker was given. The repository is public.
 *
 * `PG*` variables carry exactly the same information and cannot be echoed back
 * by a parser that never received a URI. The decode falls back to the raw value
 * so a password that was never percent-encoded still works rather than
 * exploding — the footgun is removed rather than documented.
 */
function pgEnv(connectionString: string): NodeJS.ProcessEnv {
  const decode = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  // psql treats a first argument that is not a URI as a *database name* and
  // quietly connects to the local socket instead — "connection to server on
  // socket /var/run/postgresql/.s.PGSQL.5432 failed" is what a mis-pasted
  // secret looks like, and it names neither the secret nor the real problem.
  // Say it here instead. [D-89]
  if (!/^postgres(ql)?:\/\//.test(connectionString)) {
    throw new Error(
      'SUPABASE_DB_URL must be a connection URI beginning with postgresql:// — ' +
        'Supabase → Project Settings → Database → Connection string → URI. ' +
        `Got ${connectionString.length} characters starting "${connectionString.slice(0, 12)}…".`,
    );
  }

  const url = new URL(connectionString);
  const sslmode = url.searchParams.get('sslmode');
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decode(url.username) || 'postgres',
    PGPASSWORD: decode(url.password),
    PGDATABASE: url.pathname.replace(/^\//, '') || 'postgres',
    ...(sslmode ? { PGSSLMODE: sslmode } : {}),
  };
}

/**
 * Last line of defence. Anything that reaches a log goes through here, so a
 * password cannot ride out inside a message from a tool we do not control.
 */
function scrub(text: string): string {
  let out = text;
  for (const value of [process.env.SUPABASE_DB_URL, process.env.DATABASE_URL]) {
    if (!value) continue;
    out = out.split(value).join('***');
    try {
      const password = decodeURIComponent(new URL(value).password);
      if (password.length >= 4) out = out.split(password).join('***');
    } catch {
      /* not a URL we can parse; the whole-string replacement above still ran */
    }
  }
  return out;
}

async function psqlDigests(connectionString: string, sql: string): Promise<Digest[]> {
  const { stdout } = await exec('psql', ['-tA', '-F', '|', '-c', sql], {
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    env: pgEnv(connectionString),
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
    '-v', 'ON_ERROR_STOP=1',
    '-c', 'drop schema if exists public cascade; drop schema if exists private cascade; drop schema if exists auth cascade;',
    '-c', 'create schema public;',
  ], { timeout: 120_000, env: pgEnv(connectionString) });

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

// Only when run directly, so a test can import `pgEnv` and `scrub` and exercise
// the real functions rather than a copy of them that can drift out of step.
if (process.argv[1]?.endsWith('drift-check.ts')) {
  main().catch((error) => {
    console.error(scrub(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}

export { pgEnv, scrub };
