import type { CatalogFilters } from '@/lib/db/listings';
import type { Enums } from '@/types/database';

type Taxonomy = {
  categories: Array<{ id: string; slug: string }>;
  brands: Array<{ id: string; slug: string }>;
};

const CONDITIONS: Enums<'listing_condition'>[] = ['like_new', 'excellent', 'good', 'fair'];
const SORTS = ['newest', 'price_asc', 'price_desc'] as const;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * Parses catalogue query parameters into filters, resolving slugs to ids and
 * discarding anything unrecognised. Every value is validated: an unbounded
 * `minPrice=abc` or an arbitrary `sort` would otherwise reach the query builder.
 */
export function parseCatalogSearchParams(
  raw: Record<string, string | string[] | undefined>,
  taxonomy: Taxonomy,
): { filters: CatalogFilters; activeFilterCount: number } {
  const categorySlug = first(raw.category);
  const brandSlug = first(raw.brand);
  const city = first(raw.city);
  const conditionRaw = first(raw.condition);
  const sortRaw = first(raw.sort);
  const q = first(raw.q)?.trim();

  const toAgorot = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
  };

  const page = Math.max(1, Number(first(raw.page) ?? 1) || 1);

  const category = taxonomy.categories.find((c) => c.slug === categorySlug);
  const brand = taxonomy.brands.find((b) => b.slug === brandSlug);
  const condition = CONDITIONS.find((c) => c === conditionRaw);
  const sort = SORTS.find((s) => s === sortRaw);

  const filters: CatalogFilters = {
    ...(category ? { categoryId: category.id } : {}),
    ...(brand ? { brandId: brand.id } : {}),
    ...(city ? { city } : {}),
    ...(condition ? { condition } : {}),
    ...(toAgorot(first(raw.minPrice)) !== undefined ? { minPrice: toAgorot(first(raw.minPrice)) } : {}),
    ...(toAgorot(first(raw.maxPrice)) !== undefined ? { maxPrice: toAgorot(first(raw.maxPrice)) } : {}),
    ...(q ? { q } : {}),
    ...(sort ? { sort } : {}),
    page,
  };

  const activeFilterCount = [
    category,
    brand,
    city,
    condition,
    toAgorot(first(raw.minPrice)),
    toAgorot(first(raw.maxPrice)),
    q,
  ].filter((v) => v !== undefined && v !== null && v !== '').length;

  return { filters, activeFilterCount };
}

/**
 * Indexing and canonical policy for a catalogue URL.
 *
 * The unfiltered catalogue is the indexable page. Every filtered variant is
 * noindex: category, brand and city each have a dedicated hub that is the
 * canonical home for that query, and arbitrary facet combinations produce
 * unbounded near-duplicates.
 *
 * `follow` is kept on single-filter URLs — the links out of them lead to item
 * pages we do want crawled — and dropped once two or more filters are combined,
 * which is where the combinatorial explosion starts eating crawl budget.
 */
export function catalogRobots(activeFilterCount: number): {
  noindex: boolean;
  nofollow: boolean;
} {
  return { noindex: activeFilterCount > 0, nofollow: activeFilterCount > 1 };
}

/**
 * Where a filtered catalogue URL points its canonical.
 *
 * A single category or brand filter has a real hub page; that hub is the
 * canonical home for the query, and pointing at it consolidates the signal
 * rather than splitting it between two URLs showing the same items.
 */
export function catalogCanonical(
  raw: Record<string, string | string[] | undefined>,
  activeFilterCount: number,
  taxonomy: Taxonomy,
): string {
  if (activeFilterCount === 0) return '/catalog';

  if (activeFilterCount === 1) {
    const categorySlug = first(raw.category);
    if (categorySlug && taxonomy.categories.some((c) => c.slug === categorySlug)) {
      return `/category/${categorySlug}`;
    }
    const brandSlug = first(raw.brand);
    if (brandSlug && taxonomy.brands.some((b) => b.slug === brandSlug)) {
      return `/brand/${brandSlug}`;
    }
  }

  return '/catalog';
}

export function buildCatalogHref(
  raw: Record<string, string | string[] | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'page') continue;
    const v = first(value);
    if (v) params.set(key, v);
  }
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/catalog?${qs}` : '/catalog';
}
