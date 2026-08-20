/**
 * Sitemap sources.
 *
 * Read through the anonymous client so RLS decides what is public — the
 * sitemap then cannot list a URL a visitor would be refused, which is a
 * quality signal you otherwise have to remember to maintain by hand.
 */
import { createPublicSupabase } from '@/lib/supabase/public';
import { getTaxonomy } from '@/lib/db/listings';
import { citySlug } from '@/lib/seo/slug';
import { tags } from '@/lib/cache/tags';
import type { SitemapEntry } from './sitemap-xml';

/** The hard protocol limit is 50,000 URLs per file; leave headroom. */
export const URLS_PER_SITEMAP = 45_000;

/** Programmatic pages below this are thin content, so they are not indexed. */
export const MIN_ITEMS_FOR_HUB = 3;

export type SitemapListing = {
  slug: string;
  updated_at: string;
  status: string;
  pickup_city: string;
  category_slug: string | null;
};

export async function listSitemapListings(): Promise<SitemapListing[]> {
  const supabase = createPublicSupabase({ tags: [tags.sitemap, tags.listings], revalidate: 3600 });

  // Sold items stay in the sitemap: the URL keeps whatever authority it has,
  // and dropping it is the fastest way to throw that away. [seo-engine]
  const { data, error } = await supabase
    .from('listings')
    .select('slug, updated_at, status, pickup_city, categories ( slug )')
    .in('status', ['active', 'sold'])
    .order('updated_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    slug: row.slug,
    updated_at: row.updated_at,
    status: row.status,
    pickup_city: row.pickup_city,
    category_slug: row.categories?.slug ?? null,
  }));
}

/**
 * Category × city pairs carrying at least MIN_ITEMS_FOR_HUB *active* items.
 *
 * Counted from active only — a page listing three sold sofas has nothing to
 * buy on it, and a few hundred of those is a sitewide quality problem rather
 * than a few weak URLs.
 */
export async function listCategoryCityPairs(): Promise<
  Array<{ categorySlug: string; city: string; count: number }>
> {
  const supabase = createPublicSupabase({ tags: [tags.sitemap, tags.listings], revalidate: 3600 });

  const { data, error } = await supabase
    .from('listings')
    .select('pickup_city, categories ( slug )')
    .eq('status', 'active');
  if (error) throw error;

  const counts = new Map<string, { categorySlug: string; city: string; count: number }>();
  for (const row of data ?? []) {
    const categorySlug = row.categories?.slug;
    if (!categorySlug) continue;
    const key = `${categorySlug}::${row.pickup_city}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { categorySlug, city: row.pickup_city, count: 1 });
  }

  return [...counts.values()]
    .filter((pair) => pair.count >= MIN_ITEMS_FOR_HUB)
    .sort((a, b) => b.count - a.count);
}

/** Brand hubs carrying at least MIN_ITEMS_FOR_HUB active items. */
export async function listQualifyingBrands(): Promise<Array<{ slug: string; count: number }>> {
  const supabase = createPublicSupabase({ tags: [tags.sitemap, tags.brands], revalidate: 3600 });

  const { data, error } = await supabase
    .from('listings')
    .select('brands ( slug )')
    .eq('status', 'active')
    .not('brand_id', 'is', null);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const slug = row.brands?.slug;
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_ITEMS_FOR_HUB)
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count);
}

const STATIC_PAGES: SitemapEntry[] = [
  { path: '/', priority: 1, changeFrequency: 'daily', lastModified: new Date(0) },
  { path: '/catalog', priority: 0.9, changeFrequency: 'daily', lastModified: new Date(0) },
  { path: '/sell', priority: 0.8, changeFrequency: 'monthly', lastModified: new Date(0) },
  { path: '/how-it-works', priority: 0.6, changeFrequency: 'monthly', lastModified: new Date(0) },
  { path: '/buyer-protection', priority: 0.6, changeFrequency: 'monthly', lastModified: new Date(0) },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly', lastModified: new Date(0) },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly', lastModified: new Date(0) },
  { path: '/cancellation-policy', priority: 0.3, changeFrequency: 'yearly', lastModified: new Date(0) },
  { path: '/accessibility', priority: 0.3, changeFrequency: 'yearly', lastModified: new Date(0) },
];

/** Every URL the sitemap should carry, in one list, before it is chunked. */
export async function allSitemapEntries(): Promise<SitemapEntry[]> {
  const [listings, pairs, brands, taxonomy] = await Promise.all([
    listSitemapListings(),
    listCategoryCityPairs(),
    listQualifyingBrands(),
    getTaxonomy(),
  ]);

  const now = new Date();
  const dated = (entry: SitemapEntry): SitemapEntry => ({ ...entry, lastModified: now });

  return [
    ...STATIC_PAGES.map(dated),

    ...taxonomy.categories.map((category) => ({
      path: `/category/${category.slug}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),

    ...pairs.map((pair) => ({
      path: `/category/${pair.categorySlug}/${citySlug(pair.city)}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),

    ...brands.map((brand) => ({
      path: `/brand/${brand.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),

    ...listings.map((listing) => ({
      path: `/item/${listing.slug}`,
      lastModified: new Date(listing.updated_at),
      changeFrequency: 'weekly' as const,
      // A sold item keeps its URL and its authority, but it is no longer the
      // page we most want crawled.
      priority: listing.status === 'sold' ? 0.4 : 0.7,
    })),
  ];
}

/** How many chunks the current URL set needs. */
export async function sitemapChunkCount(): Promise<number> {
  const entries = await allSitemapEntries();
  return Math.max(1, Math.ceil(entries.length / URLS_PER_SITEMAP));
}

export {
  escapeXml,
  renderSitemapIndex,
  renderUrlset,
  type SitemapEntry,
} from './sitemap-xml';
