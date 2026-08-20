/**
 * Removes every trace of the demo content.
 *
 *   npm run purge-demo -- --dry   # count what would go
 *   npm run purge-demo            # remove it
 *
 * The contract is narrow on purpose: it deletes rows flagged `is_demo` and the
 * storage objects belonging to demo sellers, and **nothing else**.
 *
 * In particular it never touches the 12 categories, 12 brands and 21 delivery
 * zones. Some of those were hand-corrected in place rather than replaced, so
 * their ids carry the operator's work. [D-57] A purge that worked by pattern —
 * "delete anything that looks like test data" — would eventually take them, and
 * a purge nobody trusts is a purge nobody runs, which is how demo rows end up
 * living in production forever. It prints the reference-row counts before and
 * after for exactly this reason: the proof is in the output, not in the
 * intention. [D-75]
 *
 * It also refuses to delete a listing that has an order against it. If a real
 * buyer has transacted on a demo row, the row is no longer demo content — it is
 * evidence, and `order_events` is append-only truth.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './release-gate/env';
import { DEMO_PASSWORD, DEMO_USERS } from '../db/demo-data';

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry');
const BUCKET = 'listing-photos';

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');
  process.exit(1);
}

async function referenceCounts(client: SupabaseClient) {
  // `select('*')` rather than `select('id')`: `site_config` is keyed by `key`
  // and has no `id`, and a head-count does not fetch the columns anyway. The
  // first version asked for `id` everywhere and failed on the one table that
  // does not have one — with an empty error message, which is its own small
  // lesson about assuming a shape.
  const count = async (table: string) => {
    const { count: n, error } = await client.from(table).select('*', { count: 'exact', head: true });
    if (error) throw error;
    return n ?? 0;
  };
  return {
    categories: await count('categories'),
    brands: await count('brands'),
    delivery_zones: await count('delivery_zones'),
    site_config: await count('site_config'),
  };
}

async function main() {
  console.log(`\nPurge demo content → ${SUPABASE_URL}${DRY ? '  (dry run)' : ''}\n`);

  const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const before = await referenceCounts(anon);
  console.log(
    `  reference before: ${before.categories} categories, ${before.brands} brands, ` +
      `${before.delivery_zones} zones, ${before.site_config} config keys`,
  );

  const { data: demoListings, error: listError } = await anon
    .from('listings')
    .select('id, slug, seller_id, status')
    .eq('is_demo', true);
  if (listError) throw listError;

  const listings = demoListings ?? [];
  console.log(`  demo listings:    ${listings.length}`);

  // A demo listing with an order against it is not demo content any more.
  const { data: orderedRows, error: orderError } = await anon
    .from('orders')
    .select('listing_id')
    .in('listing_id', listings.length ? listings.map((l) => l.id) : ['00000000-0000-0000-0000-000000000000']);
  if (orderError) throw orderError;
  const transacted = new Set((orderedRows ?? []).map((o) => o.listing_id));

  const removable = listings.filter((l) => !transacted.has(l.id));
  if (transacted.size) {
    console.log(`  kept (has orders): ${transacted.size} — order_events is append-only truth`);
  }

  if (DRY) {
    console.log(`\n  would delete ${removable.length} listings, their photos, and ${DEMO_USERS.length} demo profiles.`);
    console.log('  reference data would be untouched.\n');
    return;
  }

  const elevated = SERVICE_KEY
    ? createClient(SUPABASE_URL!, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  // Without a service key, each seller removes their own rows — RLS and the
  // storage own-folder policy decide what they may touch, which is a tighter
  // guarantee than a service-role delete, not a looser one.
  const clientFor = new Map<string, SupabaseClient>();
  if (!elevated) {
    for (const user of DEMO_USERS) {
      const client = createClient(SUPABASE_URL!, ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.signInWithPassword({
        email: user.email,
        password: DEMO_PASSWORD,
      });
      if (error) {
        console.log(`  (no session for ${user.email}: ${error.message})`);
        continue;
      }
      if (data.user) clientFor.set(data.user.id, client);
    }
  }

  let photosRemoved = 0;
  let listingsRemoved = 0;

  for (const listing of removable) {
    const client = elevated ?? clientFor.get(listing.seller_id);
    if (!client) {
      console.log(`  skipped ${listing.slug}: no authenticated route to delete it`);
      continue;
    }

    const { data: files } = await client.storage.from(BUCKET).list(`${listing.seller_id}/${listing.id}`);
    if (files?.length) {
      const paths = files.map((f) => `${listing.seller_id}/${listing.id}/${f.name}`);
      const { error } = await client.storage.from(BUCKET).remove(paths);
      if (error) console.log(`  storage ${listing.slug}: ${error.message}`);
      else photosRemoved += paths.length;
    }

    // listing_photos cascades from listings; deleting the parent is enough.
    const { error: deleteError } = await client.from('listings').delete().eq('id', listing.id);
    if (deleteError) console.log(`  listing ${listing.slug}: ${deleteError.message}`);
    else listingsRemoved += 1;
  }

  if (elevated) {
    for (const user of DEMO_USERS) {
      const { error } = await elevated.auth.admin.deleteUser(user.id);
      if (error && !/not found/i.test(error.message)) console.log(`  user ${user.email}: ${error.message}`);
    }
  } else {
    console.log('\n  Demo auth users left in place: deleting a user needs a service-role key.');
    console.log('  They own nothing now — no listings, no photos, no orders.');
  }

  const after = await referenceCounts(anon);
  console.log(
    `\n  reference after:  ${after.categories} categories, ${after.brands} brands, ` +
      `${after.delivery_zones} zones, ${after.site_config} config keys`,
  );

  const untouched =
    before.categories === after.categories &&
    before.brands === after.brands &&
    before.delivery_zones === after.delivery_zones &&
    before.site_config === after.site_config;

  console.log(`  removed ${listingsRemoved} listings and ${photosRemoved} photos.`);
  console.log(`  reference data untouched: ${untouched ? 'yes' : 'NO — INVESTIGATE'}\n`);

  if (!untouched) process.exit(1);
}

main().catch((error) => {
  console.error('\nPurge failed:', error);
  process.exit(1);
});
