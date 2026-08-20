import 'server-only';

import { createPublicSupabase } from '@/lib/supabase/public';
import { tags } from '@/lib/cache/tags';
import type { Enums } from '@/types/database';

/**
 * Public listing queries. All of them live here so the safe projections are
 * enforced in one place.
 *
 * These use the cookie-free anonymous client so the pages that call them stay
 * statically cacheable — see src/lib/supabase/public.ts. They therefore return
 * only what an anonymous visitor may see, which is exactly right for the
 * public catalogue.
 *
 * `pickup_street` is never in a projection. It is also revoked at the column
 * level for every API role, so a `select('*')` would fail rather than leak —
 * but the projection is the first line, not the only one. [D-06], [D-45]
 */

const CARD_COLUMNS = `
  id, slug, title, price_agorot, original_price_agorot, condition,
  pickup_city, status, published_at,
  categories ( slug, name_he ),
  brands ( slug, name ),
  listing_photos ( storage_path, alt_text, sort )
` as const;

const DETAIL_COLUMNS = `
  id, slug, title, description, price_agorot, original_price_agorot, condition,
  width_cm, depth_cm, height_cm,
  pickup_city, pickup_floor, pickup_has_elevator, needs_disassembly,
  allow_self_pickup, status, published_at, expires_at, view_count,
  seller_id, brand_free_text, commission_pct_override,
  categories ( id, slug, name_he ),
  brands ( slug, name ),
  listing_photos ( id, storage_path, alt_text, sort, width, height )
` as const;

/** Statuses a listing must be in to be publicly visible. Sold stays live. */
export const PUBLIC_STATUSES: Enums<'listing_status'>[] = ['active', 'reserved', 'sold'];

export type ListingCard = {
  id: string;
  slug: string;
  title: string;
  price_agorot: number;
  original_price_agorot: number | null;
  condition: Enums<'listing_condition'>;
  pickup_city: string;
  status: Enums<'listing_status'>;
  published_at: string | null;
  categories: { slug: string; name_he: string } | null;
  brands: { slug: string; name: string } | null;
  listing_photos: Array<{ storage_path: string; alt_text: string | null; sort: number }>;
};

export type CatalogFilters = {
  /** Resolved ids, not slugs: filtering on an embedded resource
   *  (`categories.slug`) does not restrict the parent rows in PostgREST
   *  without `!inner`, and filtering by id uses the indexes instead. */
  categoryId?: string;
  brandId?: string;
  city?: string;
  condition?: Enums<'listing_condition'>;
  minPrice?: number;
  maxPrice?: number;
  q?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  page?: number;
  perPage?: number;
};

export async function listCatalog(filters: CatalogFilters = {}) {
  // The catalogue is SSR (filters live in the URL), so a short revalidate
  // keeps it fresh without hammering the database on every crawl.
  const supabase = createPublicSupabase({ tags: [tags.listings], revalidate: 60 });
  const perPage = filters.perPage ?? 24;
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * perPage;

  let query = supabase
    .from('listings')
    .select(CARD_COLUMNS, { count: 'exact' })
    .in('status', PUBLIC_STATUSES);

  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.brandId) query = query.eq('brand_id', filters.brandId);
  if (filters.city) query = query.eq('pickup_city', filters.city);
  if (filters.condition) query = query.eq('condition', filters.condition);
  if (filters.minPrice !== undefined) query = query.gte('price_agorot', filters.minPrice);
  if (filters.maxPrice !== undefined) query = query.lte('price_agorot', filters.maxPrice);
  if (filters.q) {
    // Escape PostgREST's LIKE wildcards so a literal % in a search term does
    // not silently widen the query to everything.
    const term = filters.q.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike('title', `%${term}%`);
  }

  switch (filters.sort) {
    case 'price_asc':
      query = query.order('price_agorot', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('price_agorot', { ascending: false });
      break;
    default:
      // Available items first, then most recently published.
      query = query
        .order('status', { ascending: true })
        .order('published_at', { ascending: false, nullsFirst: false });
  }

  const { data, error, count } = await query.range(from, from + perPage - 1);
  if (error) throw error;

  return {
    items: (data ?? []) as unknown as ListingCard[],
    total: count ?? 0,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / perPage)),
  };
}

export async function getListingBySlug(slug: string) {
  const supabase = createPublicSupabase({
    tags: [tags.listings, tags.listing(slug)],
    revalidate: 60,
  });
  const { data, error } = await supabase
    .from('listings')
    .select(DETAIL_COLUMNS)
    .eq('slug', slug)
    .in('status', PUBLIC_STATUSES)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listLatest(limit = 8) {
  const supabase = createPublicSupabase({ tags: [tags.listings], revalidate: 3600 });
  const { data, error } = await supabase
    .from('listings')
    .select(CARD_COLUMNS)
    .eq('status', 'active')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as ListingCard[];
}

/** Similar items for the item page — including the sold state, which is the
 *  whole point of keeping sold listings live. */
export async function listSimilar(listingId: string, categoryId: string, limit = 4) {
  const supabase = createPublicSupabase({ tags: [tags.listings], revalidate: 3600 });
  const { data, error } = await supabase
    .from('listings')
    .select(CARD_COLUMNS)
    .eq('status', 'active')
    .eq('category_id', categoryId)
    .neq('id', listingId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as ListingCard[];
}

export type TaxonomyRow = { id: string; slug: string; name: string };

/** Categories and brands for the filter controls and for slug → id resolution. */
export async function getTaxonomy() {
  const supabase = createPublicSupabase({ tags: [tags.categories, tags.brands] });

  const [{ data: categories }, { data: brands }] = await Promise.all([
    supabase.from('categories').select('id, slug, name_he, intro_he, sort').order('sort'),
    supabase.from('brands').select('id, slug, name, sort').order('sort'),
  ]);

  return {
    categories: (categories ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name_he,
      intro: c.intro_he,
    })),
    brands: (brands ?? []).map((b) => ({ id: b.id, slug: b.slug, name: b.name })),
  };
}

/** Distinct cities that currently have something for sale. */
export async function getActiveCities(): Promise<string[]> {
  const supabase = createPublicSupabase({ tags: [tags.listings] });
  const { data, error } = await supabase
    .from('listings')
    .select('pickup_city')
    .in('status', PUBLIC_STATUSES);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.pickup_city))].sort((a, b) => a.localeCompare(b, 'he'));
}
