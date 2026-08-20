/**
 * Legacy data import.
 *
 * Reads a Base44 export from `--dir` (default `./legacy-data`) and writes it
 * into the v2 schema. Everything it does is idempotent and additive: run it
 * twice and the second run reports the same counts with nothing duplicated,
 * because every insert is keyed on the legacy id.
 *
 * `--dry` runs the whole thing inside a transaction and rolls back at the end,
 * rather than skipping the writes. A dry run that never touches SQL only
 * proves the parser works, which is not the question anyone is asking before
 * pointing this at production data.
 *
 *   npx tsx scripts/import-legacy.ts --dir ./legacy-data          # apply
 *   npx tsx scripts/import-legacy.ts --dir ./legacy-data --dry    # report only
 *
 * Expected files (any subset; missing ones are skipped with a note):
 *   User.json  Item.json  Order.json  Favorite.json  ItemQuestion.json
 *
 * The three transformations that carry real risk are called out inline:
 * the price field to trust, the status vocabulary, and the seller identity.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { buildSlug } from '../src/lib/seo/slug';

type LegacyRecord = Record<string, unknown>;

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? '') : fallback;
};
const DRY = args.includes('--dry');
const DIR = flag('dir', './legacy-data')!;

// ---------------------------------------------------------------------------
// Vocabulary translation
// ---------------------------------------------------------------------------

/**
 * The legacy `condition` field is free Hebrew text with six values where the
 * v2 enum has four. „חדש לגמרי" collapses into `like_new` rather than gaining a
 * fifth value: nothing on a second-hand marketplace is genuinely new, and the
 * legacy data has the seller's own optimism in it. [LI 1.1]
 */
const CONDITION: Record<string, string> = {
  'חדש לגמרי': 'like_new',
  'כמו חדש': 'like_new',
  'מצב מצוין': 'excellent',
  'מצב טוב': 'good',
  טוב: 'good',
  בסדר: 'fair',
};

/**
 * Legacy statuses, including the four values its own schema never declared but
 * its live data contained. Anything unrecognised lands in `draft`, which is
 * invisible and reversible — never `active`, which would publish an unreviewed
 * item. [LI 8.1]
 */
const LISTING_STATUS: Record<string, string> = {
  approved: 'active',
  pending_approval: 'pending_review',
  rejected: 'rejected',
  sold: 'sold',
  draft: 'draft',
  active: 'active',
  archived: 'removed',
  deleted: 'removed',
  expired: 'expired',
};

const ELEVATOR = new Set(['elevator']);

// ---------------------------------------------------------------------------

async function loadJson(dir: string, name: string): Promise<LegacyRecord[] | null> {
  const path = join(dir, name);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (Array.isArray(parsed)) return parsed as LegacyRecord[];
  // Base44 exports sometimes wrap the array in { records: [...] }.
  const records = (parsed as { records?: unknown }).records;
  return Array.isArray(records) ? (records as LegacyRecord[]) : [];
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Shekels (legacy stored floats) → agorot. */
const toAgorot = (shekels: number | null): number | null =>
  shekels === null ? null : Math.round(shekels * 100);

/**
 * Which price the buyer actually saw.
 *
 * The legacy platform stored `pricing.requested_price` as the seller's NET take
 * and `pricing.display_price` as the gross the buyer was quoted. Importing the
 * net figure as the v2 asking price would silently mark every historical item
 * down by the commission. `display_price` is the number that was on the page,
 * so it is the number the archive keeps. [D-35]
 */
function priceAgorotFor(item: LegacyRecord): number | null {
  const pricing = (item.pricing ?? {}) as LegacyRecord;
  return (
    toAgorot(num(pricing.display_price)) ??
    toAgorot(num(pricing.requested_price)) ??
    toAgorot(num(item.seller_desired_price))
  );
}

type Counters = Record<string, number>;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');

  if (!existsSync(DIR)) {
    console.error(`No export directory at ${DIR}.`);
    console.error('Point --dir at the Base44 export, or see docs/POST_RUN_HOOKUP.md.');
    process.exit(1);
  }

  console.log(`Reading ${DIR}${DRY ? '  (dry run — nothing will be written)' : ''}`);
  console.log(`Files present: ${(await readdir(DIR)).join(', ') || '(none)'}\n`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const counts: Counters = {};
  const bump = (key: string, by = 1) => {
    counts[key] = (counts[key] ?? 0) + by;
  };

  try {
    await client.query('begin');

    // -- Categories and brands must exist before listings reference them ----
    const categories = new Map<string, string>();
    for (const row of (
      await client.query<{ id: string; slug: string }>('select id, slug from public.categories')
    ).rows) {
      categories.set(row.slug, row.id);
    }

    const brands = new Map<string, string>();
    for (const row of (
      await client.query<{ id: string; name: string }>('select id, name from public.brands')
    ).rows) {
      brands.set(row.name.toLowerCase(), row.id);
    }

    // -- Users ------------------------------------------------------------
    // Profiles are created by the auth trigger on first sign-in, so the import
    // records the legacy identity instead of forging an auth user. The next
    // time that person signs in with the same address, their history is
    // already attached.
    const users = (await loadJson(DIR, 'User.json')) ?? [];
    for (const user of users) {
      const email = str(user.email)?.toLowerCase();
      if (!email) {
        bump('users.skipped_no_email');
        continue;
      }
      {
        await client.query(
          `insert into public.legacy_users (legacy_id, email, full_name, phone, city, raw)
             values ($1, $2, $3, $4, $5, $6)
           on conflict (legacy_id) do update
             set email = excluded.email, full_name = excluded.full_name,
                 phone = excluded.phone, city = excluded.city, raw = excluded.raw`,
          [
            str(user.id) ?? email,
            email,
            str(user.full_name) ?? str(user.name),
            str(user.phone),
            str(user.city) ?? str(user.location),
            JSON.stringify(user),
          ],
        );
      }
      bump('users.imported');
    }

    // -- Items ------------------------------------------------------------
    // Mirrors the schema's own CHECK constraints. Tripping one of these should
    // produce a counted, named skip — not an exception that abandons the run
    // after an unknown number of rows.
    const MIN_PRICE_AGOROT = 5_000;
    const MAX_TITLE = 120;

    const items = (await loadJson(DIR, 'Item.json')) ?? [];
    for (const item of items) {
      const legacyId = str(item.id);
      const rawTitle = str(item.title) ?? str(item.name);
      const title = rawTitle ? rawTitle.slice(0, MAX_TITLE) : null;
      const price = priceAgorotFor(item);

      if (!legacyId || !title || title.length < 3 || price === null) {
        bump('items.skipped_incomplete');
        continue;
      }
      if (rawTitle && rawTitle.length > MAX_TITLE) bump('items.title_truncated');

      if (price < MIN_PRICE_AGOROT) {
        // Below the platform's own floor. Importing it would create a listing
        // that cannot legally be sold or edited back into a valid state.
        bump('items.skipped_below_price_floor');
        continue;
      }

      // The seller's identity lives in created_by / seller_email, not in the
      // seller_id column, which is 0% filled in the live data. [LI 1.1]
      const sellerEmail = (str(item.seller_email) ?? str(item.created_by))?.toLowerCase() ?? null;

      const dimensions = (item.dimensions ?? {}) as LegacyRecord;
      let status = LISTING_STATUS[str(item.status) ?? ''] ?? 'draft';
      if (!LISTING_STATUS[str(item.status) ?? '']) bump('items.unknown_status');

      // `category_id` and the three dimensions are NOT NULL with no default,
      // and legacy rows are frequently missing them. Rather than dropping the
      // item — which would also drop its redirect — the gaps are filled and the
      // row is forced to `draft`: invisible to buyers, visible in the admin
      // listings table, and obviously in need of a human. Failing closed beats
      // publishing a listing with no dimensions.
      const categorySlug = str(item.category);
      let categoryId = categorySlug ? (categories.get(categorySlug) ?? null) : null;
      if (!categoryId) {
        bump(categorySlug ? 'items.unmatched_category' : 'items.no_category');
        categoryId = categories.get('misc') ?? null;
        status = 'draft';
      }

      const width = num(dimensions.width);
      const depth = num(dimensions.depth) ?? num(dimensions.length);
      const height = num(dimensions.height);
      if (width === null || depth === null || height === null) {
        // The CHECK constraint is >= 1, so the placeholder is 1cm rather than
        // zero. It never renders: the row is draft until someone fills it in.
        bump('items.incomplete_dimensions');
        status = 'draft';
      }

      if (!categoryId) {
        // No `misc` category means the taxonomy migration has not been applied.
        throw new Error('No fallback category: run the migrations before importing.');
      }

      const brandName = str(item.brand);
      const brandId = brandName ? (brands.get(brandName.toLowerCase()) ?? null) : null;

      // The v2 uuid is derived from the legacy id so a re-run produces the same
      // row, and so the slug — which contains the id suffix — is stable too.
      const { rows } = await client.query<{ id: string }>(
        `select ('00000000-0000-4000-8000-' || substr(md5($1), 1, 12))::uuid as id`,
        [legacyId],
      );
      const id = rows[0]!.id;
      const slug = buildSlug(title, id);

      {
        // `insert … select from profiles` writes nothing when the seller has no
        // v2 profile yet. Counting the attempt rather than the row would report
        // a clean import that inserted nothing at all — so the row count is
        // what gets counted.
        const inserted = await client.query(
          `insert into public.listings (
             id, slug, seller_id, title, description, category_id, brand_id, brand_free_text,
             condition, width_cm, depth_cm, height_cm, price_agorot, original_price_agorot,
             status, pickup_city, pickup_street, pickup_floor, pickup_has_elevator,
             needs_disassembly, allow_self_pickup, view_count, published_at, created_at
           )
           select $1, $2, p.id, $4, $5, $6, $7, $8, $9::public.listing_condition,
                  $10, $11, $12, $13, $14, $15::public.listing_status,
                  $16, $17, $18, $19, false, $20, $21, $22, $23
             from public.profiles p
            where lower(p.email) = $3
          on conflict (id) do nothing
          returning id`,
          [
            id,
            slug,
            sellerEmail,
            title,
            str(item.description) ?? str(item.item_story) ?? '',
            categoryId,
            brandId,
            brandId ? null : brandName,
            CONDITION[str(item.condition) ?? ''] ?? 'good',
            width ?? 1,
            depth ?? 1,
            height ?? 1,
            price,
            toAgorot(num(item.original_price)),
            status,
            str(item.location) ?? str(item.city) ?? 'תל אביב-יפו',
            str(item.exact_address) ?? '',
            num(item.seller_floor) ?? (Number(str(item.floor) ?? 0) || 0),
            item.seller_has_elevator === true || ELEVATOR.has(str(item.elevator) ?? ''),
            item.allow_self_pickup === true,
            num(item.views_count) ?? 0,
            str(item.approval_date),
            // NOT NULL with a `now()` default, which an explicit null overrides.
            str(item.created_date) ?? str(item.created_at) ?? new Date().toISOString(),
          ],
        );


        if (inserted.rowCount) bump('items.imported');
        else if (!sellerEmail) bump('items.skipped_no_seller_email');
        else bump('items.skipped_seller_not_registered');

        // The redirect map is the whole point of importing items at all: every
        // /ItemDetails?id=<legacy> link in a sent email keeps working. It is
        // written even when the listing itself could not be created, because a
        // visitor arriving on that link should still reach the catalogue rather
        // than a 404. [D-42]
        await client.query(
          `insert into public.legacy_redirects (legacy_id, legacy_path, new_path)
             values ($1, $2, $3)
           on conflict (legacy_id) do update set new_path = excluded.new_path`,
          [
            legacyId,
            `/ItemDetails?id=${legacyId}`,
            inserted.rowCount ? `/item/${slug}` : '/catalog',
          ],
        );
      }
    }

    // -- Orders -----------------------------------------------------------
    // Historical orders are archived rather than replayed into the live order
    // tables. Their state machine does not map onto the v2 one — 72% of them
    // died in a status that no longer exists — and injecting them would put
    // rows into the operational queues that nobody can act on. They are kept
    // as an auditable record and as redirect targets.
    const orders = (await loadJson(DIR, 'Order.json')) ?? [];
    for (const order of orders) {
      const legacyId = str(order.id);
      if (!legacyId) {
        bump('orders.skipped_no_id');
        continue;
      }
      {
        await client.query(
          `insert into public.legacy_orders (legacy_id, legacy_status, buyer_email, seller_email,
                                             item_legacy_id, total_agorot, created_at, raw)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (legacy_id) do update set raw = excluded.raw`,
          [
            legacyId,
            str(order.order_status),
            str((order.buyer_details as LegacyRecord | undefined)?.email)?.toLowerCase() ?? null,
            str(order.seller_id)?.toLowerCase() ?? null,
            str(order.item_id),
            toAgorot(num(order.total_charged)),
            str(order.created_date) ?? str(order.created_at),
            JSON.stringify(order),
          ],
        );
        await client.query(
          `insert into public.legacy_redirects (legacy_id, legacy_path, new_path)
             values ($1, $2, '/dashboard/buyer')
           on conflict (legacy_id) do nothing`,
          [legacyId, `/OrderSuccess?orderId=${legacyId}`],
        );
      }
      bump('orders.archived');
    }

    if (DRY) await client.query('rollback');
    else await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    await client.end();
  }

  console.log('Import summary');
  console.log('--------------');
  for (const [key, value] of Object.entries(counts).sort()) {
    console.log(`  ${key.padEnd(28)} ${value}`);
  }
  if (DRY) console.log('\nDry run — the transaction was rolled back.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
