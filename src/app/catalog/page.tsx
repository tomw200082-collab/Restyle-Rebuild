import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListingCard } from '@/components/listing/listing-card';
import { CatalogFilters } from '@/components/catalog/catalog-filters';
import { Pagination } from '@/components/catalog/pagination';
import { getActiveCities, getTaxonomy, listCatalog } from '@/lib/db/listings';
import {
  parseCatalogSearchParams,
  catalogRobots,
  catalogCanonical,
  buildCatalogHref,
} from '@/lib/catalog-params';
import { formatNumber } from '@/lib/format';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Canonical and robots are computed from the query string, not fixed, because
 * the whole indexing policy for this route lives in the filters. A page that
 * renders correctly but ships the wrong canonical is broken.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const raw = await searchParams;
  const taxonomy = await getTaxonomy();
  const { activeFilterCount } = parseCatalogSearchParams(raw, taxonomy);
  const robots = catalogRobots(activeFilterCount);

  return {
    title: 'קטלוג רהיטים יד שנייה',
    description:
      'כל הרהיטים יד שנייה הזמינים בגוש דן — ספות, שולחנות, ארונות ועוד. הובלה עד הבית ותשלום מאובטח.',
    alternates: { canonical: catalogCanonical(raw, activeFilterCount, taxonomy) },
    ...(robots.noindex ? { robots: { index: false, follow: !robots.nofollow } } : {}),
  };
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const [{ categories, brands }, cities] = await Promise.all([getTaxonomy(), getActiveCities()]);

  const parsed = parseCatalogSearchParams(raw, { categories, brands });
  const result = await listCatalog(parsed.filters);

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-h1 text-ink">קטלוג רהיטים יד שנייה</h1>
        <p className="text-body-sm text-ink-muted tabular">{formatNumber(result.total)} פריטים</p>
      </div>

      <div className="mt-8">
        <CatalogFilters
          categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
          brands={brands.map((b) => ({ value: b.slug, label: b.name }))}
          cities={cities.map((c) => ({ value: c, label: c }))}
        />
      </div>

      {result.items.length === 0 ? (
        <EmptyState
          title="לא מצאנו פריטים שמתאימים לסינון"
          body="נסו להרחיב את טווח המחירים או להסיר סינון."
          action={
            <Button asChild variant="secondary">
              <Link href="/catalog">ניקוי הסינון</Link>
            </Button>
          }
        />
      ) : (
        <>
          <h2 className="sr-only">תוצאות החיפוש</h2>
          <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
            {result.items.map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} priority={i < 4} />
            ))}
          </div>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            buildHref={(p) => buildCatalogHref(raw, p)}
          />
        </>
      )}
    </Container>
  );
}
