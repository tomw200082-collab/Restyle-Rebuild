import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListingCard } from '@/components/listing/listing-card';
import { CatalogFilters } from '@/components/catalog/catalog-filters';
import { Pagination } from '@/components/catalog/pagination';
import { getActiveCities, getTaxonomy, listCatalog } from '@/lib/db/listings';
import { parseCatalogSearchParams, catalogRobots, buildCatalogHref } from '@/lib/catalog-params';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'קטלוג רהיטים יד שנייה',
  description:
    'כל הרהיטים יד שנייה הזמינים בגוש דן — ספות, שולחנות, ארונות ועוד. הובלה עד הבית ותשלום מאובטח.',
  alternates: { canonical: '/catalog' },
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const [{ categories, brands }, cities] = await Promise.all([getTaxonomy(), getActiveCities()]);

  const parsed = parseCatalogSearchParams(raw, { categories, brands });
  const result = await listCatalog(parsed.filters);
  const robots = catalogRobots(parsed.activeFilterCount);

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-h1 text-ink">קטלוג רהיטים יד שנייה</h1>
        <p className="text-body-sm text-ink-muted tabular">{formatNumber(result.total)} פריטים</p>
      </div>

      {/* Multi-filter combinations are noindex — facet combinatorics generate
          unbounded near-duplicate pages, and the category/brand hubs are the
          indexable surface. */}
      {robots.noindex ? <meta name="robots" content="noindex, nofollow" /> : null}

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
