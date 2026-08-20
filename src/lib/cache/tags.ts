/**
 * Cache tags. One module owns the tag vocabulary and the mutation → tag map,
 * so a missed invalidation is a visible omission here rather than a stale page
 * nobody notices. See the nextjs-seo-engine skill.
 */

export const tags = {
  listings: 'listings',
  listing: (id: string) => `listing:${id}`,
  category: (slug: string) => `category:${slug}`,
  brand: (slug: string) => `brand:${slug}`,
  city: (city: string) => `city:${city}`,
  categories: 'categories',
  brands: 'brands',
  config: 'config',
  zones: 'zones',
  sitemap: 'sitemap',
} as const;

export type MutationKind =
  | 'listing_published'
  | 'listing_updated'
  | 'listing_unpublished'
  | 'order_completed'
  | 'config_changed'
  | 'taxonomy_changed';

/**
 * Which tags a given mutation invalidates. Callers pass what they know; the
 * map decides. Keeping this as data rather than scattered `revalidateTag`
 * calls is what stops an invalidation from being silently forgotten.
 */
export function tagsForMutation(
  kind: MutationKind,
  ctx: { listingId?: string; categorySlug?: string; brandSlug?: string; city?: string } = {},
): string[] {
  const out = new Set<string>();

  const addContext = () => {
    if (ctx.listingId) out.add(tags.listing(ctx.listingId));
    if (ctx.categorySlug) out.add(tags.category(ctx.categorySlug));
    if (ctx.brandSlug) out.add(tags.brand(ctx.brandSlug));
    if (ctx.city) out.add(tags.city(ctx.city));
  };

  switch (kind) {
    case 'listing_published':
    case 'listing_unpublished':
      out.add(tags.listings);
      out.add(tags.sitemap);
      addContext();
      break;
    case 'listing_updated':
      out.add(tags.listings);
      addContext();
      break;
    case 'order_completed':
      out.add(tags.listings);
      addContext();
      break;
    case 'config_changed':
      // Delivery estimates are rendered into item pages, so a fee change
      // invalidates the catalogue, not just the config.
      out.add(tags.config);
      out.add(tags.listings);
      break;
    case 'taxonomy_changed':
      out.add(tags.categories);
      out.add(tags.brands);
      out.add(tags.sitemap);
      break;
  }

  return [...out];
}
