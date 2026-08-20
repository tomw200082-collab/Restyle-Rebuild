/**
 * Puts demo content on the target project, idempotently.
 *
 *   npm run demo:seed            # against NEXT_PUBLIC_SUPABASE_URL
 *   npm run demo:seed -- --dry   # say what would change, change nothing
 *
 * Why this exists: five release-gate stages are permanently `skipped` against
 * an empty catalogue — Product JSON-LD, the sold-page 200 check, the item-page
 * Lighthouse budget, and the item rows that make the sitemap and route audits
 * meaningful. A skip is never a pass, so an empty production database means the
 * gate can never be green. [D-63]
 *
 * Two rules it does not break:
 *
 *  1. **Idempotent.** Fixed ids, upserts, `on conflict do nothing`. Running it
 *     three times leaves the same rows. Proved, not assumed.
 *  2. **It never touches operator-seeded reference data.** The 12 categories,
 *     12 brands and 21 delivery zones are read, never written — some of them
 *     were hand-corrected in place precisely so their ids would survive. [D-57]
 *     Every row it creates carries `is_demo`, so `npm run purge-demo` can take
 *     all of it back out and nothing else. [D-75]
 *
 * ## On credentials
 *
 * It uses a service-role key when one is present. When one is not, it does the
 * honest thing rather than the convenient one: it creates the demo users
 * directly, signs in **as them** through the public Auth API, and uploads their
 * photos through the same storage policy a real seller's upload goes through
 * (`(storage.foldername(name))[1] = auth.uid()`). That is slower and it is
 * better — it proves the seller upload path works on the live project, which a
 * service-role upload would bypass entirely.
 */
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { loadEnv } from './release-gate/env';
import { DEMO_LISTINGS, DEMO_PASSWORD, DEMO_USERS } from '../db/demo-data';
import { buildSlug } from '../src/lib/seo/slug';

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DRY = process.argv.includes('--dry');
const BUCKET = 'listing-photos';
const PHOTOS_PER_LISTING = 3;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');
  process.exit(1);
}

/** `https://<ref>.supabase.co` → `<ref>`. */
function projectRef(url: string): string | null {
  return /^https?:\/\/([a-z0-9]+)\.supabase\./.exec(url)?.[1] ?? null;
}

/**
 * A service-role key that belongs to a *different project* than the URL is
 * ignored, loudly.
 *
 * This is not hypothetical: the environment this was written in supplies
 * `SUPABASE_SERVICE_ROLE_KEY` for an unrelated project, and it is a plausible
 * shape for any developer machine or CI runner that has touched two Supabase
 * projects. Here it failed safely with a 401 — but had the ambient key been
 * valid for a project that also had a `listings` table, this script would have
 * written a demo catalogue into someone else's database and reported success.
 *
 * Same class as [D-73]: a credential that works by accident of environment is a
 * credential nobody has checked. The `ref` claim is not a secret; it is the
 * project id that appears in the URL.
 */
function serviceKeyForThisProject(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  const target = projectRef(SUPABASE_URL!);
  if (!target) return key;

  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()) as {
      ref?: string;
    };
    if (claims.ref && claims.ref !== target) {
      console.warn(
        `  Ignoring SUPABASE_SERVICE_ROLE_KEY: it belongs to project "${claims.ref}", ` +
          `the target is "${target}".`,
      );
      return null;
    }
  } catch {
    // A non-JWT key (`sb_secret_…`) carries no readable project claim. Nothing
    // to check, so let it through and let the API reject it if it is wrong.
  }
  return key;
}

const SERVICE_KEY = serviceKeyForThisProject();

/** Deterministic. A seed whose data shifts per run makes assertions unwritable. */
const EPOCH = new Date('2026-08-10T09:00:00.000Z');
const daysFrom = (days: number) => new Date(EPOCH.getTime() + days * 86_400_000).toISOString();

const SWATCHES = [
  { bg: '#F3EDE4', fg: '#C4633F' },
  { bg: '#EDE6DA', fg: '#6B645C' },
  { bg: '#F7E9E2', fg: '#A94F2E' },
  { bg: '#E9E4DA', fg: '#22201D' },
];

/** Generated locally — nothing is fetched from an external host. */
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

/**
 * A UUID v5 derived from the slug, so a listing's id is a function of its
 * content rather than of when the script ran.
 *
 * Two things come out of that. The insert can name its own id, so it never
 * needs `RETURNING` — and `authenticated` deliberately has no table-level
 * SELECT on `listings`, only column grants, because that is what protects the
 * seller's street address [D-45]. And a re-run addresses the same rows rather
 * than creating parallel ones, which is what makes "idempotent" true instead of
 * hoped for.
 */
function uuidV5(name: string): string {
  // Fixed namespace: any constant UUID works, and a literal one keeps this
  // dependency-free and reproducible.
  const namespace = '9b2e2c1a-4f3d-4c8a-9d1e-6a7b8c9d0e1f';
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(Buffer.concat([nsBytes, Buffer.from(name, 'utf8')])).digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  process.stdout.write(`  ${label.padEnd(40, '.')} `);
  try {
    const out = await fn();
    console.log('ok');
    return out;
  } catch (error) {
    console.log('FAILED');
    throw error;
  }
}

type Ctx = {
  /** Writes rows. Service role when available, otherwise a signed-in demo user. */
  write: SupabaseClient;
  /** True when a service-role key was supplied. */
  elevated: boolean;
};

async function main() {
  console.log(`\nDemo content → ${SUPABASE_URL}${DRY ? '  (dry run)' : ''}\n`);

  const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Reference data is read, never written. If it is missing, stop: creating it
  // here would be a second writer to a dataset the operator owns, which is the
  // exact drift that put `sealy` on a row named סילון. [D-57]
  const { data: categories, error: catError } = await anon
    .from('categories')
    .select('id, slug, name_he');
  if (catError) throw catError;
  const { data: brands, error: brandError } = await anon.from('brands').select('id, slug');
  if (brandError) throw brandError;

  if (!categories?.length) {
    console.error('No categories on the target. Apply the migrations first — this script never creates reference data.');
    process.exit(1);
  }
  console.log(`  reference data: ${categories.length} categories, ${brands?.length ?? 0} brands (read only)\n`);

  const categoryId = new Map(categories.map((c) => [c.slug, c.id]));
  const brandId = new Map((brands ?? []).map((b) => [b.slug, b.id]));

  const planned = DEMO_LISTINGS.filter((l) => categoryId.has(l.categorySlug));
  const skipped = DEMO_LISTINGS.length - planned.length;

  if (DRY) {
    console.log(`  would create ${DEMO_USERS.length} demo users`);
    console.log(`  would create ${planned.length} demo listings (${skipped} skipped: unknown category)`);
    console.log(`  would upload ${planned.length * PHOTOS_PER_LISTING} placeholder photos`);
    console.log('\n  Nothing was written.\n');
    return;
  }

  if (!SERVICE_KEY) {
    console.log('  No service-role key. Creating users via sign-up and uploading as them —');
    console.log('  the same storage policy a real seller goes through.\n');
  }

  const ctx: Ctx = SERVICE_KEY
    ? {
        write: createClient(SUPABASE_URL!, SERVICE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
        elevated: true,
      }
    : { write: anon, elevated: false };

  // --- users --------------------------------------------------------------
  const sellerClients: SupabaseClient[] = [];
  const sellerIds: string[] = [];

  for (const user of DEMO_USERS) {
    // A client authenticated *as this seller*, used for their listings and
    // photos, so RLS and the storage own-folder policy are exercised rather
    // than bypassed.
    const sellerClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const id = await step(`user ${user.email}`, async () => {
      // Sign in first, sign up only if that fails.
      //
      // The obvious order — always sign up, ignore "already registered" — costs
      // one confirmation email per user per run, and Supabase's default limit
      // is two per hour. A re-run against an already-seeded project then fails
      // on a rate limit rather than being the no-op it should be. Asking
      // "does this account exist?" by trying to use it costs nothing.
      const existing = await sellerClient.auth.signInWithPassword({
        email: user.email,
        password: DEMO_PASSWORD,
      });
      if (!existing.error && existing.data.user) return existing.data.user.id;

      if (ctx.elevated) {
        const { error } = await ctx.write.auth.admin.createUser({
          id: user.id,
          email: user.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: user.fullName },
        });
        if (error && !/already been registered|already exists/i.test(error.message)) throw error;
        return user.id;
      }

      const signUp = await anon.auth.signUp({
        email: user.email,
        password: DEMO_PASSWORD,
        options: { data: { full_name: user.fullName } },
      });
      if (signUp.error && !/already registered/i.test(signUp.error.message)) throw signUp.error;
      return signUp.data.user?.id ?? null;
    });

    const signIn = await sellerClient.auth.signInWithPassword({
      email: user.email,
      password: DEMO_PASSWORD,
    });
    if (signIn.error) {
      // Hand over the one thing only an operator can do, ready to run, rather
      // than failing with a message that needs interpreting.
      // EXECUTION_POLICY.md, "Refusing well".
      if (/not confirmed/i.test(signIn.error.message)) {
        console.error(
          `\n  ${user.email} was created but its email is unconfirmed, and this project ` +
            'requires confirmation.\n' +
            '  Either supply SUPABASE_SERVICE_ROLE_KEY for this project, or run once:\n\n' +
            "    update auth.users set email_confirmed_at = now()\n" +
            "     where email like 'demo.%@restyle.co.il' and email_confirmed_at is null;\n",
        );
      }
      throw new Error(`sign-in as ${user.email}: ${signIn.error.message}`);
    }

    const resolvedId = signIn.data.user?.id ?? id;
    if (!resolvedId) throw new Error(`could not resolve an id for ${user.email}`);

    sellerClients.push(sellerClient);
    sellerIds.push(resolvedId);

    await step(`profile ${user.fullName}`, async () => {
      // Update, not upsert. `handle_new_user` already created the row on
      // sign-up, and the profiles insert policy correctly does not let a user
      // insert their own — an upsert here asks RLS for a permission the
      // application never needs, and gets refused. [D-29]
      const { error } = await (ctx.elevated ? ctx.write : sellerClient)
        .from('profiles')
        .update({
          full_name: user.fullName,
          city: user.city,
          phone: user.phone,
          is_demo: true,
        })
        .eq('id', resolvedId);
      if (error) throw error;
    });
  }

  // --- listings -----------------------------------------------------------
  let created = 0;
  let photos = 0;

  for (const [index, listing] of planned.entries()) {
    const sellerId = sellerIds[listing.sellerIndex]!;
    const client = ctx.elevated ? ctx.write : sellerClients[listing.sellerIndex]!;
    const slug = buildSlug(listing.title, `demo-${index}`);

    const listingId = uuidV5(slug);

    await step(`listing ${listing.title.slice(0, 26)}`, async () => {
      const row = {
        id: listingId,
        slug,
        seller_id: sellerId,
        title: listing.title,
        description: listing.description,
        category_id: categoryId.get(listing.categorySlug)!,
        brand_id: listing.brandSlug ? (brandId.get(listing.brandSlug) ?? null) : null,
        condition: listing.condition,
        width_cm: listing.widthCm,
        depth_cm: listing.depthCm,
        height_cm: listing.heightCm,
        price_agorot: listing.priceAgorot,
        original_price_agorot: listing.originalPriceAgorot ?? null,
        // A seller may insert only `draft` or `pending_review` — a listing goes
        // live through admin review, and that policy is the product's main
        // trust mechanism rather than an obstacle. So the unelevated path
        // creates rows in the review queue, exactly as a real seller would, and
        // an admin approves them. With a service-role key the script sets the
        // final status directly, because an operator seeding a demo catalogue
        // is not pretending to be a seller. [D-75]
        status: ctx.elevated ? (listing.status ?? 'active') : 'pending_review',
        pickup_city: listing.city,
        pickup_street: 'רחוב ההדגמה 1',
        pickup_floor: listing.floor,
        pickup_has_elevator: listing.hasElevator,
        needs_disassembly: listing.needsDisassembly,
        allow_self_pickup: true,
        is_demo: true,
        published_at: daysFrom(-index),
        expires_at: daysFrom(90 - index),
      };

      // `ignoreDuplicates` — `on conflict do nothing`, not `do update`.
      //
      // Both the returning clause and `on conflict do update` need a
      // table-level SELECT on `listings`, and `authenticated` deliberately does
      // not have one: it holds column grants instead, which is what keeps the
      // seller's street address unreadable. [D-45] So the demo seeder works
      // within the same privilege a real seller has, rather than asking for a
      // wider one — the id is derived from the slug, so a re-run addresses the
      // same row and does nothing to it.
      //
      // `size_class` is absent on purpose: the trigger derives it, and writing
      // it here would be a second opinion on a rule that has one owner. [D-72]
      const { error } = await client
        .from('listings')
        .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      created += 1;
    });

    await step(`photos for ${slug.slice(0, 24)}`, async () => {
      for (let i = 0; i < PHOTOS_PER_LISTING; i++) {
        const svg = placeholderSvg(listing.title, i, index);
        const webp = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
        const path = `${sellerId}/${listingId}/${i}.webp`;

        const { error: uploadError } = await client.storage
          .from(BUCKET)
          .upload(path, webp, { contentType: 'image/webp', upsert: true });
        if (uploadError) throw uploadError;

        const { error: rowError } = await client.from('listing_photos').upsert(
          {
            id: uuidV5(path),
            listing_id: listingId,
            storage_path: path,
            sort: i,
            alt_text: listing.title,
            width: 1200,
            height: 900,
          },
          { onConflict: 'id', ignoreDuplicates: true },
        );
        if (rowError) throw rowError;
        photos += 1;
      }
    });
  }

  console.log(`\n  ${DEMO_USERS.length} users, ${created} listings, ${photos} photos.`);
  if (skipped) console.log(`  ${skipped} listing(s) skipped — category not present on the target.`);
  console.log('  Every row carries is_demo. `npm run purge-demo` removes all of it.');

  if (!ctx.elevated) {
    console.log('\n  The listings are in `pending_review`, because that is as far as a seller');
    console.log('  can take them. Approve them from /admin/review, or with database access:');
    console.log('\n    select public.transition_listing(id, \'active\')');
    console.log('      from public.listings where is_demo and status = \'pending_review\';\n');
  } else {
    console.log('');
  }
}

main().catch((error) => {
  console.error('\nDemo content failed:', error);
  process.exit(1);
});
