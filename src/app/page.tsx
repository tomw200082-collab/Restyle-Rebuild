import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/listing/listing-card';
import { listLatest } from '@/lib/db/listings';
import { createPublicSupabase } from '@/lib/supabase/public';
import { tags } from '@/lib/cache/tags';

export const revalidate = 3600;

/**
 * The home page inherits its title and description from the root layout, but a
 * canonical cannot be inherited: putting `alternates.canonical` in the layout
 * would make every page that does not override it claim `/` as its canonical.
 * So the highest-authority URL on the site was the one page shipping without
 * one, and any variant that serves it — `/?utm_source=…`, a trailing slash, an
 * alternate host — could be indexed separately and split its authority.
 *
 * Found by `route-auditor`, which is exactly the surface nothing in the
 * application ever requests. [D-67]
 */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const HOW_IT_WORKS = [
  { title: 'בוחרים פריט', body: 'כל פריט בקטלוג עבר בדיקה שלנו, עם מידות, מצב ותמונות אמיתיות.' },
  { title: 'משלמים באתר', body: 'התשלום מאובטח ומוחזק אצלנו עד שהפריט מגיע אליכם.' },
  { title: 'אנחנו מובילים', body: 'צוות מקצועי אוסף מהמוכר ומביא עד הבית, במועד שנקבע מראש.' },
  { title: '48 שעות לבדוק', body: 'אחרי המסירה יש לכם 48 שעות לוודא שהכל תקין. רק אז המוכר מקבל את הכסף.' },
];

const TRUST = ['תשלום מאובטח באתר', 'הובלה עד הבית', '48 שעות לבדוק שהכל תקין', 'פרסום חינם למוכרים'];

export default async function HomePage() {
  const supabase = createPublicSupabase({ tags: [tags.categories] });
  const [latest, { data: categories }] = await Promise.all([
    listLatest(8),
    supabase.from('categories').select('slug, name_he').order('sort').limit(6),
  ]);

  return (
    <>
      <section className="border-b border-line bg-sand/30">
        <Container className="py-16 md:py-24">
          <div className="max-w-2xl">
            <h1 className="font-display text-display-2 text-ink md:text-display-1">
              הרהיט הבא שלכם כבר קיים
            </h1>
            <p className="mt-5 text-body-lg text-ink-muted">
              רהיטים יד שנייה נבחרים מגוש דן. אנחנו אוספים, מובילים ומגינים על הכסף שלכם —
              אתם רק בוחרים.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/catalog">לקטלוג</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/sell">יש לי רהיט למכירה</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-16">
        <h2 className="text-h2 text-ink">קטגוריות</h2>
        <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {(categories ?? []).map((c) => (
            <li key={c.slug}>
              <Link
                href={`/category/${c.slug}`}
                className="block rounded-lg border border-line bg-surface px-4 py-5 text-body-sm text-ink transition-colors hover:bg-sand"
              >
                {c.name_he}
              </Link>
            </li>
          ))}
        </ul>
      </Container>

      <Container className="pb-16">
        <div className="flex items-baseline justify-between">
          <h2 className="text-h2 text-ink">חדשים בקטלוג</h2>
          <Link href="/catalog" className="text-body-sm text-clay hover:underline">
            לכל הפריטים
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {latest.map((listing, i) => (
            <ListingCard key={listing.id} listing={listing} priority={i < 4} />
          ))}
        </div>
      </Container>

      <section className="border-y border-line bg-sand/30">
        <Container className="py-16">
          <h2 className="text-h2 text-ink">איך זה עובד</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-4">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.title}>
                <span className="font-display text-h2 text-clay tabular">{i + 1}</span>
                <h3 className="mt-2 text-h3 text-ink">{step.title}</h3>
                <p className="mt-1 text-body-sm text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <Container className="py-12">
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-body-sm text-ink-muted">
          {TRUST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Container>
    </>
  );
}
