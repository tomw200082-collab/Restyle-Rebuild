/**
 * Public route discovery.
 *
 * Static routes come from the filesystem so a page added tomorrow is audited
 * without anyone remembering to add it to a list. Dynamic routes are sampled
 * from the target database, because `/item/[slug]` is only meaningful with a
 * slug that exists.
 *
 * Authenticated and machine surfaces are excluded here rather than at the call
 * site: `/admin`, `/dashboard`, `/checkout`, `/pay`, `/login`, `/auth` and
 * `/api` are the same set `robots.ts` disallows, and the two lists agreeing is
 * itself worth keeping in one place.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { citySlug } from '../../src/lib/seo/slug';

const ROOT = process.cwd();
const APP_DIR = join(ROOT, 'src', 'app');

/** Mirrors the disallow list in src/app/robots.ts. */
const NON_PUBLIC = ['admin', 'dashboard', 'checkout', 'pay', 'api', 'login', 'auth'];

export type PublicRoute = {
  /** Path with a leading slash. */
  path: string;
  /** 'static' — from the filesystem; 'dynamic' — sampled from the database. */
  kind: 'static' | 'dynamic';
  /** Which page template this exercises, for grouping in reports. */
  template: string;
  /**
   * What an anonymous GET should return. Read from the page source rather than
   * from a maintained list: a page calling `requireUser` redirects to login,
   * and that is correct behaviour, not a defect. Hardcoding the exceptions
   * would mean the next auth-gated page silently becomes a gate failure — or,
   * worse, that a page which *stops* redirecting is never noticed.
   */
  expectedStatus: number;
  /**
   * Whether the route belongs in the sitemap. False for auth-gated pages and
   * for anything declaring `robots: { index: false }` — again read from source,
   * so the sitemap check and the page agree by construction.
   */
  indexable: boolean;
};

const AUTH_GATE = /\brequire(User|Admin|Seller|Buyer)\s*\(/;
const NOINDEX = /robots\s*:\s*\{[^}]*index\s*:\s*false/;

async function classify(pageFile: string): Promise<{ expectedStatus: number; indexable: boolean }> {
  let source = '';
  try {
    source = await readFile(pageFile, 'utf8');
  } catch {
    return { expectedStatus: 200, indexable: true };
  }
  const gated = AUTH_GATE.test(source);
  return {
    // Next's `redirect()` answers a document GET with 307.
    expectedStatus: gated ? 307 : 200,
    indexable: !gated && !NOINDEX.test(source),
  };
}

export async function staticRoutes(): Promise<PublicRoute[]> {
  const found: PublicRoute[] = [];

  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Route groups and private folders never appear in a URL.
        if (entry.name.startsWith('_')) continue;
        await walk(full);
        continue;
      }
      if (entry.name !== 'page.tsx') continue;

      const segments = relative(APP_DIR, dir).split(sep).filter(Boolean);
      if (segments.some((s) => s.startsWith('(') || NON_PUBLIC.includes(s))) continue;
      // Dynamic segments are filled from the database instead.
      if (segments.some((s) => s.includes('['))) continue;

      found.push({
        path: '/' + segments.join('/'),
        kind: 'static',
        template: segments.length ? segments.join('/') : 'home',
        ...(await classify(full)),
      });
    }
  }

  await walk(APP_DIR);
  found.push(
    { path: '/sitemap.xml', kind: 'static', template: 'sitemap-index', expectedStatus: 200, indexable: false },
    { path: '/robots.txt', kind: 'static', template: 'robots', expectedStatus: 200, indexable: false },
  );
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

type RestRow = Record<string, unknown>;

async function rest(path: string): Promise<RestRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  // A failed sample is not a failed gate — it makes the dynamic stages report
  // `skipped` with a reason, which is visible. Swallowing it into an empty list
  // silently would make an empty catalogue and a broken API look identical.
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return (await response.json()) as RestRow[];
}

export type DynamicSample = {
  routes: PublicRoute[];
  /** A slug of a sold listing, when one exists — for the sold-page-200 check. */
  soldItemSlug: string | null;
  counts: { categories: number; brands: number; listings: number; cities: number };
};

/** Samples up to `perTemplate` real URLs per dynamic template. */
export async function dynamicRoutes(perTemplate = 3): Promise<DynamicSample> {
  const [categories, brands, listings, zones, sold] = await Promise.all([
    rest(`categories?select=slug&limit=${perTemplate}`),
    rest(`brands?select=slug&limit=${perTemplate}`),
    // Category comes along so the cat×city hub can be built from a pair that
    // actually has an item in it — the page resolves its city against cities
    // with active listings, so any other pair is a legitimate 404.
    rest(`listings?select=slug,pickup_city,categories(slug)&status=eq.active&limit=${perTemplate}`),
    rest(`delivery_zones?select=city&limit=${perTemplate}`),
    rest('listings?select=slug&status=eq.sold&limit=1'),
  ]);

  const routes: PublicRoute[] = [];
  const dyn = { kind: 'dynamic' as const, expectedStatus: 200, indexable: true };
  for (const row of categories) routes.push({ path: `/category/${row.slug}`, template: 'category/[slug]', ...dyn });
  for (const row of listings) routes.push({ path: `/item/${row.slug}`, template: 'item/[slug]', ...dyn });

  // Brand hubs and category × city hubs enter the sitemap only above
  // MIN_ITEMS_FOR_HUB active items, and go noindex below it. That threshold is
  // an SEO policy owned by src/lib/seo/sitemap-data.ts; re-deriving it here
  // would be a second copy of a rule, which is the drift class ADR-001 names.
  // So these routes are audited for their status code and left out of the
  // sitemap-membership assertion — the sitemap is the authority.
  const thresholdGated = { ...dyn, indexable: false };
  for (const row of brands) routes.push({ path: `/brand/${row.slug}`, template: 'brand/[slug]', ...thresholdGated });

  const withCity = listings.find(
    (row) => row.pickup_city && (row.categories as { slug?: string } | null)?.slug,
  );
  if (withCity) {
    const categorySlug = (withCity.categories as { slug: string }).slug;
    routes.push({
      path: `/category/${categorySlug}/${citySlug(String(withCity.pickup_city))}`,
      template: 'category/[slug]/[city]',
      ...thresholdGated,
    });
  }

  return {
    routes,
    soldItemSlug: sold[0]?.slug ? String(sold[0].slug) : null,
    counts: {
      categories: categories.length,
      brands: brands.length,
      listings: listings.length,
      cities: zones.length,
    },
  };
}
