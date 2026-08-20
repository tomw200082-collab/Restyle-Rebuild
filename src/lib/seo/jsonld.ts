/**
 * JSON-LD builders.
 *
 * Structured data fails silently: a malformed block is simply ignored by
 * Google and nothing in the app ever notices. So the shapes are built here,
 * from typed inputs, and asserted by `scripts/validate-jsonld.ts` in the gate
 * rather than eyeballed.
 */
import { env } from '@/lib/env';

const SITE = env.siteUrl.replace(/\/$/, '');

export const absolute = (path: string) => (path.startsWith('http') ? path : `${SITE}${path}`);

export type JsonLd = Record<string, unknown>;

/**
 * schema.org wants a decimal string derived from the amount, never a formatted
 * one — `₪1,100` is rejected outright, and the he-IL formatter emits
 * directional marks besides.
 */
export const priceString = (agorot: number) => (agorot / 100).toFixed(2);

type ProductInput = {
  title: string;
  description: string | null;
  slug: string;
  priceAgorot: number;
  status: string;
  photoUrls: string[];
  brandName?: string | null;
  categoryName?: string | null;
};

export function productJsonLd(listing: ProductInput): JsonLd {
  const url = absolute(`/item/${listing.slug}`);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title,
    ...(listing.description ? { description: listing.description } : {}),
    ...(listing.photoUrls.length ? { image: listing.photoUrls.map(absolute) } : {}),
    ...(listing.brandName ? { brand: { '@type': 'Brand', name: listing.brandName } } : {}),
    ...(listing.categoryName ? { category: listing.categoryName } : {}),
    // No gradation in schema.org matches our four-value scale, and claiming
    // NewCondition on second-hand goods is a policy violation.
    itemCondition: 'https://schema.org/UsedCondition',
    offers: {
      '@type': 'Offer',
      url,
      price: priceString(listing.priceAgorot),
      priceCurrency: 'ILS',
      // `reserved` stays InStock: it is still purchasable by others until the
      // holder's checkout captures. [D-15]
      availability:
        listing.status === 'sold'
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
      // The platform is the merchant of record, not the individual seller.
      seller: { '@type': 'Organization', name: 'Restyle' },
    },
  };
}

/**
 * Outermost first. Under RTL the *visual* order flips, but `position` is
 * semantic and must not be reversed to match what the eye sees.
 */
export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  };
}

export function organizationJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Restyle',
    url: SITE,
    logo: absolute('/icon.svg'),
    description: 'רהיטים יד שנייה נבחרים בגוש דן, עם הובלה עד הבית ותשלום מאובטח.',
    areaServed: { '@type': 'Place', name: 'גוש דן' },
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Restyle',
    url: SITE,
    inLanguage: 'he-IL',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/catalog?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function itemListJsonLd(
  name: string,
  items: Array<{ title: string; slug: string }>,
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absolute(`/item/${item.slug}`),
      name: item.title,
    })),
  };
}
