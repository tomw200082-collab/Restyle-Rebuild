/**
 * Drops all application data and re-seeds.
 *
 * Development and CI only — it refuses to run against anything that is not
 * plainly a local database. Tests create listings, orders and payouts on every
 * run, and after enough runs they outnumber the seed by an order of magnitude:
 * the catalogue fills with `פריט בדיקה`, `generateStaticParams` prerenders
 * hundreds of junk pages, and an audit against "the item page" is really an
 * audit of a fixture with no photos behind it.
 *
 *   npm run db:reset
 */
import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';

const run = promisify(execFile);

/**
 * Truncated in dependency order; `cascade` covers the rest. `profiles` and the
 * auth tables are left alone — the seeded accounts are what the e2e storage
 * states authenticate as, and recreating them would invalidate every
 * `.auth/*.json`.
 */
const TABLES = [
  'order_events',
  'disputes',
  'payouts',
  'deliveries',
  'orders',
  'offers',
  'favorites',
  'listing_photos',
  'listings',
  'outbound_events',
  'legacy_redirects',
  'legacy_orders',
  'legacy_users',
];

function assertLocal(connectionString: string) {
  const { hostname } = new URL(connectionString);
  const local = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];
  if (!local.includes(hostname)) {
    throw new Error(
      `Refusing to reset a non-local database (${hostname}). ` +
        'This deletes every listing, order and payout.',
    );
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  assertLocal(url);

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    // order_events is append-only by trigger, and the trigger is right to
    // refuse an UPDATE or DELETE. TRUNCATE is a different operation and is
    // exactly what a reset should use — the audit log is being discarded
    // wholesale with its orders, not edited behind anyone's back.
    await client.query(`truncate table ${TABLES.map((t) => `public.${t}`).join(', ')} cascade`);
    console.log(`truncated ${TABLES.length} tables`);
  } finally {
    await client.end();
  }

  const { stdout } = await run('npx', ['tsx', 'db/seed.ts'], { env: process.env });
  console.log(stdout.trim());

  // `next build` reuses `.next/cache/fetch-cache` across builds, and the
  // catalogue reads go through `fetch` with an explicit `revalidate`. Without
  // this, the next build prerenders the *old* catalogue: pages referencing
  // listings that no longer exist, with 404ing images, from a database that
  // plainly does not contain them. Nothing about the build output says so.
  await rm(join(process.cwd(), '.next', 'cache', 'fetch-cache'), {
    recursive: true,
    force: true,
  });
  console.log('cleared the Next fetch cache');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
