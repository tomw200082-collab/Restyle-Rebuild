/**
 * Idempotent seed. Safe to run repeatedly — it is run on every fresh checkout
 * and before the e2e suite.
 *
 * Deterministic by construction: fixed uuids, fixed credentials, no random or
 * clock-derived values, so Playwright can assert on specific rows.
 *
 * Note on statuses: listings are written directly in their final status rather
 * than being walked through transition_listing(). Seed rows are fixtures, not
 * user journeys — the transitions themselves are covered by unit and e2e tests.
 * published_at / expires_at are computed here so they match what the transition
 * function would have set.
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { config as loadEnv } from 'node:process';
import { CATEGORIES, BRANDS, DELIVERY_ZONES, USERS, LISTINGS } from './seed-data.js';
import type { ListingSeed } from './seed-data.js';
import { buildSlug, buildSimpleSlug } from '../src/lib/seo/slug.js';

void loadEnv;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = 'listing-photos';
const PHOTOS_PER_LISTING = 3;

// Deterministic seed timestamps. Never `new Date()` — a seed whose data shifts
// per run makes e2e assertions unwritable.
const EPOCH = new Date('2026-08-01T09:00:00.000Z');
const daysFrom = (base: Date, days: number) =>
  new Date(base.getTime() + days * 86_400_000).toISOString();

/** Palette from the design system. Placeholders are generated locally — no
 *  external image fetching. */
const SWATCHES = [
  { bg: '#F3EDE4', fg: '#C4633F' },
  { bg: '#EDE6DA', fg: '#6B645C' },
  { bg: '#F7E9E2', fg: '#A94F2E' },
  { bg: '#E9E4DA', fg: '#22201D' },
];

function placeholderSvg(label: string, index: number, seedIndex: number): string {
  const s = SWATCHES[(seedIndex + index) % SWATCHES.length]!;
  const escaped = label.replace(/[<>&]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="${s.bg}"/>
  <g opacity="0.10" fill="none" stroke="${s.fg}" stroke-width="2">
    ${Array.from({ length: 9 }, (_, i) => `<circle cx="600" cy="470" r="${70 + i * 45}"/>`).join('')}
  </g>
  <rect x="60" y="60" width="1080" height="780" fill="none" stroke="${s.fg}" stroke-opacity="0.25" stroke-width="2"/>
  <text x="600" y="455" text-anchor="middle" fill="${s.fg}"
        font-family="Heebo, Arial, sans-serif" font-size="58" font-weight="500"
        direction="rtl">${escaped}</text>
  <text x="600" y="530" text-anchor="middle" fill="${s.fg}" fill-opacity="0.55"
        font-family="Heebo, Arial, sans-serif" font-size="30" letter-spacing="6">RESTYLE</text>
  <text x="600" y="800" text-anchor="middle" fill="${s.fg}" fill-opacity="0.4"
        font-family="Heebo, Arial, sans-serif" font-size="24" direction="rtl">תמונת הדגמה</text>
</svg>`;
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  process.stdout.write(`  ${label.padEnd(34, '.')} `);
  try {
    const out = await fn();
    console.log('ok');
    return out;
  } catch (err) {
    console.log('FAILED');
    throw err;
  }
}

async function seedConfig() {
  // admin_email is what the profile trigger reads to grant the admin role. [D-29]
  const { error } = await db
    .from('site_config')
    .upsert({ key: 'admin_email', value: ADMIN_EMAIL, description: 'Set by db/seed.ts from ADMIN_EMAIL.', is_public: false }, { onConflict: 'key' });
  if (error) throw error;
}

async function seedTaxonomy() {
  const { error: catErr } = await db.from('categories').upsert(
    CATEGORIES.map((c) => ({
      slug: c.slug, name_he: c.name_he, sort: c.sort, intro_he: c.intro_he,
    })),
    { onConflict: 'slug' },
  );
  if (catErr) throw catErr;

  const { error: brandErr } = await db
    .from('brands')
    .upsert(BRANDS.map((b) => ({ slug: b.slug, name: b.name, sort: b.sort })), { onConflict: 'slug' });
  if (brandErr) throw brandErr;

  const { error: zoneErr } = await db
    .from('delivery_zones')
    .upsert(DELIVERY_ZONES, { onConflict: 'city' });
  if (zoneErr) throw zoneErr;
}

async function seedUsers() {
  for (const u of USERS) {
    // createUser is idempotent here: the local shim updates on conflict, and on
    // Supabase an existing user surfaces as an already-registered error we skip.
    const { error } = await db.auth.admin.createUser({
      // @ts-expect-error — the local shim accepts a fixed id so fixtures stay stable.
      id: u.id,
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name, phone: u.phone },
    });
    if (error && !/already/i.test(error.message)) throw error;

    const { error: profileErr } = await db
      .from('profiles')
      .upsert(
        { id: u.id, email: u.email, full_name: u.full_name, phone: u.phone, city: u.city, role: u.role },
        { onConflict: 'id' },
      );
    if (profileErr) throw profileErr;
  }
}

type Lookup = Map<string, string>;

async function buildLookups(): Promise<{ categories: Lookup; brands: Lookup }> {
  const { data: cats, error: catErr } = await db.from('categories').select('id, slug');
  if (catErr) throw catErr;
  const { data: brands, error: brandErr } = await db.from('brands').select('id, slug');
  if (brandErr) throw brandErr;

  return {
    categories: new Map((cats ?? []).map((c) => [c.slug, c.id])),
    brands: new Map((brands ?? []).map((b) => [b.slug, b.id])),
  };
}

function listingRow(l: ListingSeed, lookups: { categories: Lookup; brands: Lookup }, index: number) {
  const status = l.status ?? 'active';
  const sellerId = USERS.find((u) => u.email === `${l.seller}@restyle.test`)!.id;
  const categoryId = lookups.categories.get(l.category);
  if (!categoryId) throw new Error(`unknown category slug: ${l.category}`);

  const isLive = status === 'active' || status === 'sold' || status === 'reserved';
  const publishedAt = isLive ? daysFrom(EPOCH, -(index % 21) - 1) : null;
  const expiresAt =
    status === 'active' ? daysFrom(EPOCH, 90 - (index % 21))
    : status === 'expired' ? daysFrom(EPOCH, -3)
    : null;

  return {
    id: l.id,
    slug: buildSlug(l.title, l.id),
    seller_id: sellerId,
    title: l.title,
    description: l.description,
    category_id: categoryId,
    brand_id: l.brand ? (lookups.brands.get(l.brand) ?? null) : null,
    brand_free_text: null,
    condition: l.condition,
    width_cm: l.w,
    depth_cm: l.d,
    height_cm: l.h,
    original_price_agorot: l.original ? l.original * 100 : null,
    price_agorot: l.price * 100,
    status,
    rejection_reason: l.rejection_reason ?? null,
    pickup_city: l.city,
    pickup_street: l.street,
    pickup_floor: l.floor,
    pickup_has_elevator: l.elevator,
    needs_disassembly: l.disassembly ?? false,
    allow_self_pickup: true,
    published_at: publishedAt,
    expires_at: expiresAt,
    created_at: daysFrom(EPOCH, -(index % 30) - 2),
  };
}

async function seedListings(lookups: { categories: Lookup; brands: Lookup }) {
  const rows = LISTINGS.map((l, i) => listingRow(l, lookups, i));
  const { error } = await db.from('listings').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

/** Deterministic photo uuid: `…-a000-<listing ordinal><photo ordinal>`. */
function photoId(listingOrdinal: number, photoOrdinal: number): string {
  const tail = `${String(listingOrdinal).padStart(9, '0')}${String(photoOrdinal).padStart(3, '0')}`;
  return `00000000-0000-4000-a000-${tail}`;
}

async function seedPhotos() {
  const categoryName = new Map(CATEGORIES.map((c) => [c.slug, c.name_he]));

  // Clear photos for the seeded listings first, so a change to the photo count
  // or to the id scheme cannot leave orphans behind on a re-run.
  const { error: clearErr } = await db
    .from('listing_photos')
    .delete()
    .in('listing_id', LISTINGS.map((l) => l.id));
  if (clearErr) throw clearErr;

  for (const [index, l] of LISTINGS.entries()) {
    const sellerId = USERS.find((u) => u.email === `${l.seller}@restyle.test`)!.id;
    const label = categoryName.get(l.category) ?? 'רהיט';
    const rows: Array<Record<string, unknown>> = [];

    for (let i = 0; i < PHOTOS_PER_LISTING; i += 1) {
      const svg = placeholderSvg(label, i, index);
      const webp = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
      const path = `${sellerId}/${l.id}/${i + 1}.webp`;

      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(path, webp, { contentType: 'image/webp', upsert: true });
      if (upErr && !/exists/i.test(upErr.message)) throw upErr;

      rows.push({
        // Distinct namespace (…-a000-) plus listing ordinal and photo ordinal,
        // so two listings can never derive the same photo id.
        id: photoId(index + 1, i + 1),
        listing_id: l.id,
        storage_path: path,
        sort: i,
        alt_text: `${l.title} — תמונה ${i + 1}`,
        width: 1200,
        height: 900,
      });
    }

    const { error } = await db.from('listing_photos').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
}

async function seedLegacyRedirects() {
  // Real legacy item ids from the forensic audit, so the redirect middleware
  // has verifiable fixtures. [LI 6], [D-42]
  const active = LISTINGS.filter((l) => (l.status ?? 'active') === 'active').slice(0, 5);
  const legacyIds = [
    '69945e0971855f8d63b09a87',
    '6992ecb0457704d641acefd7',
    '6992e50fcbaea2d5da7e6f0b',
    '6991c4e800c505010167abb0',
    '6991b7b78e667d05072bf1a2',
  ];

  const rows = legacyIds.map((legacyId, i) => {
    const target = active[i]!;
    return {
      legacy_id: legacyId,
      legacy_path: `/ItemDetails?id=${legacyId}`,
      new_path: `/item/${buildSlug(target.title, target.id)}`,
    };
  });

  const { error } = await db.from('legacy_redirects').upsert(rows, { onConflict: 'legacy_id' });
  if (error) throw error;
}

async function main() {
  console.log(`\nSeeding ${SUPABASE_URL}\n`);
  await step('site config', seedConfig);
  await step('categories, brands, zones', seedTaxonomy);
  await step('users and profiles', seedUsers);
  const lookups = await step('lookups', buildLookups);
  await step(`listings (${LISTINGS.length})`, () => seedListings(lookups));
  await step('photos (generated locally)', seedPhotos);
  await step('legacy redirects', seedLegacyRedirects);

  const { count } = await db.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active');
  const { count: photoCount } = await db
    .from('listing_photos')
    .select('*', { count: 'exact', head: true });

  const expectedPhotos = LISTINGS.length * PHOTOS_PER_LISTING;
  if (photoCount !== expectedPhotos) {
    throw new Error(
      `photo count is ${photoCount}, expected ${expectedPhotos}. ` +
        'Photo ids are probably colliding across listings.',
    );
  }

  console.log(`\nDone. ${count ?? 0} active listings, ${photoCount} photos.`);
  console.log('Accounts: admin@restyle.test / seller@restyle.test / buyer@restyle.test');
}

main().catch((err) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
