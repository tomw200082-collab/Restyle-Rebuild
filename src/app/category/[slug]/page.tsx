import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListingCard } from '@/components/listing/listing-card';
import { getTaxonomy, listCatalog } from '@/lib/db/listings';
import { formatNumber } from '@/lib/format';

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

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

  const result = await listCatalog({ categoryId: category.id, perPage: 48 });

  return (
    <Container className="py-10">
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
        <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {result.items.map((listing, i) => (
            <ListingCard key={listing.id} listing={listing} priority={i < 4} />
          ))}
        </div>
      )}
    </Container>
  );
}
