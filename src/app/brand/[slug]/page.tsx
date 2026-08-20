import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListingCard } from '@/components/listing/listing-card';
import { JsonLdScript } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/seo/jsonld';
import { getTaxonomy, listCatalog } from '@/lib/db/listings';
import { MIN_ITEMS_FOR_HUB } from '@/lib/seo/sitemap-data';
import { formatNumber } from '@/lib/format';

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const { brands } = await getTaxonomy();
  return brands.map((brand) => ({ slug: brand.slug }));
}

async function findBrand(slug: string) {
  const { brands } = await getTaxonomy();
  return brands.find((b) => b.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const brand = await findBrand(slug);
  if (!brand) return { title: 'המותג לא נמצא' };

  const { total } = await listCatalog({ brandId: brand.id, perPage: 1 });

  return {
    title: `${brand.name} יד שנייה — רהיטים למכירה`,
    description:
      `רהיטי ${brand.name} יד שנייה בגוש דן. ${formatNumber(total)} פריטים זמינים ` +
      'עם הובלה ותשלום מאובטח.',
    alternates: { canonical: `/brand/${brand.slug}` },
    robots: total < MIN_ITEMS_FOR_HUB ? { index: false, follow: true } : undefined,
  };
}

export default async function BrandPage({ params }: Params) {
  const { slug } = await params;
  const brand = await findBrand(slug);
  if (!brand) notFound();

  const result = await listCatalog({ brandId: brand.id, perPage: 48 });

  const trail = [
    { name: 'בית', path: '/' },
    { name: 'קטלוג', path: '/catalog' },
    { name: brand.name, path: `/brand/${brand.slug}` },
  ];

  return (
    <Container className="py-10">
      <JsonLdScript
        data={[breadcrumbJsonLd(trail), itemListJsonLd(`${brand.name} יד שנייה`, result.items)]}
      />
      <h1 className="font-display text-display-2 text-ink">{brand.name} יד שנייה</h1>
      <p className="mt-4 text-body-sm text-ink-muted tabular">{formatNumber(result.total)} פריטים</p>

      {result.items.length === 0 ? (
        <EmptyState
          title={`אין כרגע פריטי ${brand.name} בקטלוג`}
          body="הקטלוג מתעדכן כל יום. בינתיים אפשר לראות את כל הפריטים הזמינים."
          action={
            <Button asChild variant="secondary">
              <Link href="/catalog">לקטלוג המלא</Link>
            </Button>
          }
        />
      ) : (
        <>
          <h2 className="sr-only">פריטים של המותג</h2>
          <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
            {result.items.map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} priority={i < 4} />
            ))}
          </div>
        </>
      )}
    </Container>
  );
}
