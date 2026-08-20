import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListingCard } from '@/components/listing/listing-card';
import { JsonLdScript } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/seo/jsonld';
import { getActiveCities, getTaxonomy, listCatalog } from '@/lib/db/listings';
import { MIN_ITEMS_FOR_HUB, listCategoryCityPairs } from '@/lib/seo/sitemap-data';
import { cityFromSlug, citySlug } from '@/lib/seo/slug';
import { formatNumber } from '@/lib/format';

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string; city: string }> };

/**
 * Only the pairs that clear the item threshold are pre-rendered. Everything
 * else is still reachable and still renders — it just isn't worth building
 * ahead of a request, and it isn't indexed.
 */
export async function generateStaticParams() {
  const pairs = await listCategoryCityPairs();
  return pairs.map((pair) => ({ slug: pair.categorySlug, city: citySlug(pair.city) }));
}

async function resolve(slug: string, cityParam: string) {
  const [{ categories }, cities] = await Promise.all([getTaxonomy(), getActiveCities()]);
  const category = categories.find((c) => c.slug === slug);
  const city = cityFromSlug(cityParam, cities);
  if (!category || !city) return null;

  const result = await listCatalog({ categoryId: category.id, city, perPage: 48 });
  return { category, city, result };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, city } = await params;
  const resolved = await resolve(slug, city);
  if (!resolved) return { title: 'הדף לא נמצא' };

  const { category, city: cityName, result } = resolved;

  return {
    title: `${category.name} יד שנייה ב${cityName}`,
    description:
      `${category.name} יד שנייה למכירה ב${cityName}. ` +
      'פריטים נבחרים עם הובלה עד הבית ותשלום מאובטח.',
    alternates: { canonical: `/category/${slug}/${city}` },
    // Below the threshold this is a thin page. It stays reachable and stays
    // crawlable — links out of it still carry weight — but a few hundred
    // one-item pages is a sitewide quality problem, not a few weak URLs.
    robots: result.total >= MIN_ITEMS_FOR_HUB ? undefined : { index: false, follow: true },
  };
}

export default async function CategoryCityPage({ params }: Params) {
  const { slug, city } = await params;
  const resolved = await resolve(slug, city);
  if (!resolved) notFound();

  const { category, city: cityName, result } = resolved;

  const trail = [
    { name: 'בית', path: '/' },
    { name: 'קטלוג', path: '/catalog' },
    { name: category.name, path: `/category/${slug}` },
    { name: cityName, path: `/category/${slug}/${city}` },
  ];

  return (
    <Container className="py-10">
      <JsonLdScript
        data={[
          breadcrumbJsonLd(trail),
          itemListJsonLd(`${category.name} יד שנייה ב${cityName}`, result.items),
        ]}
      />

      <nav aria-label="מיקום" className="mb-6 text-body-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-ink">בית</Link></li>
          <li aria-hidden>/</li>
          <li>
            <Link href={`/category/${slug}`} className="hover:text-ink">
              {category.name}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-ink">{cityName}</li>
        </ol>
      </nav>

      <h1 className="font-display text-display-2 text-ink">
        {category.name} יד שנייה ב{cityName}
      </h1>
      <p className="mt-4 max-w-3xl text-body-lg text-ink-muted">
        כל ה{category.name} הזמינים ב{cityName} — נבדקו לפני הפרסום, מגיעים עם הובלה עד הבית
        ו-48 שעות לבדוק שהכול תקין.
      </p>
      <p className="mt-4 text-body-sm text-ink-muted tabular">{formatNumber(result.total)} פריטים</p>

      {result.items.length === 0 ? (
        <EmptyState
          title={`אין כרגע ${category.name} ב${cityName}`}
          body={`הקטלוג מתעדכן כל יום. בינתיים אפשר לראות ${category.name} בכל אזור גוש דן.`}
          action={
            <Button asChild variant="secondary">
              <Link href={`/category/${slug}`}>לכל ה{category.name}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <h2 className="sr-only">פריטים בעיר</h2>
          <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
            {result.items.map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} priority={i < 4} />
            ))}
          </div>
        </>
      )}

      <p className="mt-12 text-body-sm text-ink-muted">
        <Link href={`/category/${slug}`} className="text-clay hover:underline">
          לכל ה{category.name} בגוש דן
        </Link>
      </p>
    </Container>
  );
}
