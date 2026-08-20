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
import { listCategoryCityPairs } from '@/lib/seo/sitemap-data';
import { citySlug } from '@/lib/seo/slug';
import { formatNumber } from '@/lib/format';

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const { categories } = await getTaxonomy();
  return categories.map((category) => ({ slug: category.slug }));
}

async function findCategory(slug: string) {
  const { categories } = await getTaxonomy();
  return categories.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const category = await findCategory(slug);
  if (!category) return { title: 'הקטגוריה לא נמצאה' };

  const { total } = await listCatalog({ categoryId: category.id, perPage: 1 });

  return {
    title: `${category.name} יד שנייה בגוש דן`,
    description:
      `${formatNumber(total)} ${category.name} יד שנייה למכירה בגוש דן. ` +
      'הובלה עד הבית, תשלום מאובטח ו-48 שעות לבדוק שהכל תקין.',
    alternates: { canonical: `/category/${category.slug}` },
  };
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const category = await findCategory(slug);
  if (!category) notFound();

  const [result, pairs] = await Promise.all([
    listCatalog({ categoryId: category.id, perPage: 48 }),
    listCategoryCityPairs(),
  ]);

  // The city hubs only earn traffic if something links to them; the sitemap
  // alone is a weak signal and leaves them orphaned in the internal graph.
  const cities = pairs.filter((pair) => pair.categorySlug === category.slug);

  const trail = [
    { name: 'בית', path: '/' },
    { name: 'קטלוג', path: '/catalog' },
    { name: category.name, path: `/category/${category.slug}` },
  ];

  return (
    <Container className="py-10">
      <JsonLdScript
        data={[breadcrumbJsonLd(trail), itemListJsonLd(`${category.name} יד שנייה`, result.items)]}
      />
      <h1 className="font-display text-display-2 text-ink">{category.name} יד שנייה</h1>
      {category.intro ? (
        <p className="mt-4 max-w-3xl text-body-lg text-ink-muted">{category.intro}</p>
      ) : null}
      <p className="mt-4 text-body-sm text-ink-muted tabular">{formatNumber(result.total)} פריטים</p>

      {result.items.length === 0 ? (
        <EmptyState
          title={`אין כרגע ${category.name} בקטלוג`}
          body="הקטלוג מתעדכן כל יום. בינתיים אפשר לראות את כל הפריטים הזמינים."
          action={
            <Button asChild variant="secondary">
              <Link href="/catalog">לקטלוג המלא</Link>
            </Button>
          }
        />
      ) : (
        <>
          <h2 className="sr-only">פריטים בקטגוריה</h2>
          <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
            {result.items.map((listing, i) => (
              <ListingCard key={listing.id} listing={listing} priority={i < 4} />
            ))}
          </div>
        </>
      )}

      {cities.length > 0 ? (
        <nav aria-label="לפי עיר" className="mt-14 border-t border-line pt-8">
          <h2 className="text-h3 text-ink">{category.name} לפי עיר</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {cities.map((pair) => (
              <li key={pair.city}>
                <Link
                  href={`/category/${category.slug}/${citySlug(pair.city)}`}
                  className="inline-flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-1.5 text-body-sm text-ink transition-colors hover:bg-sand"
                >
                  {pair.city}
                  <span className="text-ink-subtle tabular">{formatNumber(pair.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </Container>
  );
}
