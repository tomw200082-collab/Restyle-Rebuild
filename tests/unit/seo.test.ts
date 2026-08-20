import { describe, expect, it } from 'vitest';
import { citySlug, cityFromSlug } from '@/lib/seo/slug';
import { breadcrumbJsonLd, priceString, productJsonLd } from '@/lib/seo/jsonld';
import { matchLegacyRoute } from '@/lib/seo/legacy-routes';
import { escapeXml, renderSitemapIndex, renderUrlset } from '@/lib/seo/sitemap-xml';
import { catalogCanonical, catalogRobots } from '@/lib/catalog-params';

describe('city slugs', () => {
  it('maps known Gush Dan cities to the spelling people search', () => {
    expect(citySlug('תל אביב-יפו')).toBe('tel-aviv-yafo');
    expect(citySlug('רמת גן')).toBe('ramat-gan');
    expect(citySlug('פתח תקווה')).toBe('petah-tikva');
  });

  it('falls back to transliteration for an unknown city rather than failing', () => {
    const slug = citySlug('עיר חדשה');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.length).toBeGreaterThan(0);
  });

  it('round-trips through the same table, so the two directions cannot drift', () => {
    const cities = ['תל אביב-יפו', 'רמת גן', 'חולון'];
    for (const city of cities) {
      expect(cityFromSlug(citySlug(city), cities)).toBe(city);
    }
  });

  it('returns null for a slug no candidate produces', () => {
    expect(cityFromSlug('paris', ['תל אביב-יפו'])).toBeNull();
  });
});

describe('Product JSON-LD', () => {
  const base = {
    title: 'ספה תלת מושבית',
    description: 'תיאור',
    slug: 'sapa-tlat-k3f9a2',
    priceAgorot: 110_000,
    photoUrls: ['https://cdn.example/a.webp'],
    brandName: 'איקאה',
    categoryName: 'ספות וכורסאות',
  };

  it('emits a plain decimal string, never a formatted price', () => {
    const offers = productJsonLd({ ...base, status: 'active' }).offers as Record<string, unknown>;
    expect(offers.price).toBe('1100.00');
    expect(offers.priceCurrency).toBe('ILS');
    // he-IL formatting would smuggle in RLM marks and a trailing symbol.
    expect(String(offers.price)).toMatch(/^\d+\.\d{2}$/);
  });

  it('rounds agorot to two decimals without floating-point drift', () => {
    expect(priceString(1)).toBe('0.01');
    expect(priceString(19_999)).toBe('199.99');
    expect(priceString(0)).toBe('0.00');
  });

  it('marks a sold item SoldOut but keeps it a valid Product', () => {
    const sold = productJsonLd({ ...base, status: 'sold' });
    const offers = sold.offers as Record<string, unknown>;
    expect(offers.availability).toBe('https://schema.org/SoldOut');
    expect(sold.name).toBe(base.title);
  });

  it('keeps a reserved item InStock — it is still purchasable by others', () => {
    const offers = productJsonLd({ ...base, status: 'reserved' }).offers as Record<string, unknown>;
    expect(offers.availability).toBe('https://schema.org/InStock');
  });

  it('always declares UsedCondition', () => {
    for (const status of ['active', 'sold', 'reserved']) {
      const product = productJsonLd({ ...base, status });
      expect(product.itemCondition).toBe('https://schema.org/UsedCondition');
    }
  });

  it('omits brand entirely rather than emitting an empty one', () => {
    expect(productJsonLd({ ...base, status: 'active', brandName: null }).brand).toBeUndefined();
  });
});

describe('BreadcrumbList', () => {
  it('numbers positions outermost-first regardless of RTL rendering', () => {
    const crumbs = breadcrumbJsonLd([
      { name: 'בית', path: '/' },
      { name: 'קטלוג', path: '/catalog' },
      { name: 'ספות', path: '/category/sofas' },
    ]);
    const items = crumbs.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[0]!.name).toBe('בית');
  });
});

describe('legacy routes', () => {
  const q = (search: string) => new URLSearchParams(search);

  it('matches both casings, because both are in the wild', () => {
    expect(matchLegacyRoute('/Catalog', q(''))).toEqual({ kind: 'static', target: '/catalog' });
    expect(matchLegacyRoute('/catalog', q(''))).toEqual({ kind: 'static', target: '/catalog' });
    expect(matchLegacyRoute('/HOWITWORKS', q(''))).toEqual({
      kind: 'static',
      target: '/how-it-works',
    });
  });

  it('routes an item link to a database lookup with a catalogue fallback', () => {
    const match = matchLegacyRoute('/ItemDetails', q('id=69945e0971855f8d63b09a87'));
    expect(match).toEqual({
      kind: 'lookup',
      page: 'itemdetails',
      legacyId: '69945e0971855f8d63b09a87',
      fallback: '/catalog',
    });
  });

  it('never 404s an id-bearing legacy URL whose id is missing or malformed', () => {
    expect(matchLegacyRoute('/ItemDetails', q(''))).toEqual({ kind: 'static', target: '/catalog' });
    expect(matchLegacyRoute('/ItemDetails', q('id=notanid'))).toEqual({
      kind: 'static',
      target: '/catalog',
    });
    expect(matchLegacyRoute('/OrderSuccess', q('orderId='))).toEqual({
      kind: 'static',
      target: '/dashboard/buyer',
    });
  });

  it('maps every admin screen the old emails deep-linked to', () => {
    expect(matchLegacyRoute('/AdminV2', q('screen=orders'))).toEqual({
      kind: 'static',
      target: '/admin/orders',
    });
    expect(matchLegacyRoute('/AdminV2', q('screen=review'))).toEqual({
      kind: 'static',
      target: '/admin/review',
    });
    // An unknown screen still lands inside the admin rather than nowhere.
    expect(matchLegacyRoute('/AdminV2', q('screen=whatever'))).toEqual({
      kind: 'static',
      target: '/admin',
    });
  });

  it('ignores paths that are not legacy at all, so the common request is free', () => {
    expect(matchLegacyRoute('/item/sapa-k3f9a2', q(''))).toBeNull();
    expect(matchLegacyRoute('/', q(''))).toBeNull();
    expect(matchLegacyRoute('/category/sofas/tel-aviv-yafo', q(''))).toBeNull();
  });
});

describe('catalogue indexing policy', () => {
  const taxonomy = {
    categories: [{ id: 'c1', slug: 'sofas' }],
    brands: [{ id: 'b1', slug: 'ikea' }],
  };

  it('indexes the unfiltered catalogue and canonicalises it to itself', () => {
    expect(catalogRobots(0)).toEqual({ noindex: false, nofollow: false });
    expect(catalogCanonical({}, 0, taxonomy)).toBe('/catalog');
  });

  it('canonicalises a single hub-backed filter onto its hub', () => {
    expect(catalogCanonical({ category: 'sofas' }, 1, taxonomy)).toBe('/category/sofas');
    expect(catalogCanonical({ brand: 'ikea' }, 1, taxonomy)).toBe('/brand/ikea');
  });

  it('canonicalises a hubless single filter back to the catalogue', () => {
    expect(catalogCanonical({ city: 'חולון' }, 1, taxonomy)).toBe('/catalog');
    expect(catalogCanonical({ category: 'nosuchcategory' }, 1, taxonomy)).toBe('/catalog');
  });

  it('keeps follow on one filter and drops it once facets combine', () => {
    expect(catalogRobots(1)).toEqual({ noindex: true, nofollow: false });
    expect(catalogRobots(2)).toEqual({ noindex: true, nofollow: true });
    expect(catalogCanonical({ category: 'sofas', city: 'חולון' }, 2, taxonomy)).toBe('/catalog');
  });
});

describe('sitemap XML', () => {
  const entry = {
    path: '/item/a-b',
    lastModified: new Date('2026-01-02T03:04:05.000Z'),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  };

  it('escapes characters that would otherwise produce invalid XML', () => {
    expect(escapeXml('a&b')).toBe('a&amp;b');
    expect(escapeXml('<script>')).toBe('&lt;script&gt;');
  });

  it('renders a well-formed urlset with absolute locations', () => {
    const xml = renderUrlset('https://restyle.co.il', [entry]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<loc>https://restyle.co.il/item/a-b</loc>');
    expect(xml).toContain('<lastmod>2026-01-02T03:04:05.000Z</lastmod>');
    expect(xml).toContain('<priority>0.7</priority>');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('renders an index naming every chunk', () => {
    const xml = renderSitemapIndex('https://restyle.co.il', 3, new Date('2026-01-02T00:00:00Z'));
    for (const id of [0, 1, 2]) {
      expect(xml).toContain(`https://restyle.co.il/sitemap/${id}.xml`);
    }
    expect(xml).not.toContain('/sitemap/3.xml');
  });
});
