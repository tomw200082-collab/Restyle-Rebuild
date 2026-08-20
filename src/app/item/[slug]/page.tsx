import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gallery } from '@/components/item/gallery';
import { DeliveryEstimator } from '@/components/item/delivery-estimator';
import { FavoriteButton } from '@/components/item/favorite-button';
import { ListingCard } from '@/components/listing/listing-card';
import { JsonLdScript } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, productJsonLd } from '@/lib/seo/jsonld';
import { listSitemapListings } from '@/lib/seo/sitemap-data';
import { photoUrl } from '@/lib/storage';
import { getListingBySlug, listSimilar } from '@/lib/db/listings';
import { getDeliveryZones, getSiteConfig } from '@/lib/pricing/config';
import { formatDimensions, formatPrice, publicName } from '@/lib/format';
import { CONDITION_LABELS } from '@/lib/labels';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

/**
 * Pre-renders the active catalogue and leaves sold items to ISR.
 *
 * Sold listings stay indexable and stay 200 forever, but there can eventually
 * be far more of them than active ones, and building every one on every deploy
 * would trade build time for pages nobody is arriving on today. They render on
 * first request and are cached from then on.
 */
export async function generateStaticParams() {
  const listings = await listSitemapListings();
  return listings.filter((l) => l.status === 'active').map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: 'הפריט לא נמצא' };

  const condition = CONDITION_LABELS[listing.condition];
  const dims = formatDimensions(listing.width_cm, listing.depth_cm, listing.height_cm);

  return {
    title: `${listing.title} — ${condition} ב${listing.pickup_city}`,
    description:
      `${listing.title} למכירה ב${listing.pickup_city}. ${condition}, ${dims} ס״מ. ` +
      `${formatPrice(listing.price_agorot)} כולל אפשרות הובלה עד הבית ותשלום מאובטח.`,
    alternates: { canonical: `/item/${listing.slug}` },
    openGraph: {
      title: listing.title,
      description: `${condition} · ${listing.pickup_city} · ${formatPrice(listing.price_agorot)}`,
      type: 'website',
    },
  };
}

export default async function ItemPage({ params }: Params) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  const [config, zones, similar] = await Promise.all([
    getSiteConfig(),
    getDeliveryZones(),
    listSimilar(listing.id, listing.categories?.id ?? '', 4),
  ]);

  const seller = listing.profiles;

  const isSold = listing.status === 'sold';
  const isReserved = listing.status === 'reserved';
  const brandName = listing.brands?.name ?? listing.brand_free_text;

  const pricingListing = {
    price_agorot: listing.price_agorot,
    pickup_city: listing.pickup_city,
    pickup_floor: listing.pickup_floor,
    pickup_has_elevator: listing.pickup_has_elevator,
    needs_disassembly: listing.needs_disassembly,
    commission_pct_override: listing.commission_pct_override,
  };

  const photos = [...(listing.listing_photos ?? [])].sort((a, b) => a.sort - b.sort);

  const trail = [
    { name: 'בית', path: '/' },
    { name: 'קטלוג', path: '/catalog' },
    ...(listing.categories
      ? [{ name: listing.categories.name_he, path: `/category/${listing.categories.slug}` }]
      : []),
    { name: listing.title, path: `/item/${listing.slug}` },
  ];

  return (
    <Container className="py-8">
      <JsonLdScript
        data={[
          productJsonLd({
            title: listing.title,
            description: listing.description,
            slug: listing.slug,
            priceAgorot: listing.price_agorot,
            status: listing.status,
            photoUrls: photos.map((photo) => photoUrl(photo.storage_path)),
            brandName: brandName,
            categoryName: listing.categories?.name_he ?? null,
          }),
          breadcrumbJsonLd(trail),
        ]}
      />

      <nav aria-label="מיקום" className="mb-6 text-body-sm text-ink-muted">
        {/* DOM order is semantic (outermost first); flex handles the RTL flip. */}
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="hover:text-ink">בית</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/catalog" className="hover:text-ink">קטלוג</Link></li>
          {listing.categories ? (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link href={`/category/${listing.categories.slug}`} className="hover:text-ink">
                  {listing.categories.name_he}
                </Link>
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Gallery photos={listing.listing_photos ?? []} title={listing.title} />
        </div>

        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24 space-y-6">
            <div>
              {isSold ? <Badge tone="ink">נמכר</Badge> : null}
              {isReserved ? <Badge tone="clay">בתהליך רכישה</Badge> : null}

              <h1 className="mt-2 font-display text-h1 text-ink">{listing.title}</h1>

              <div className="mt-3 flex items-baseline gap-3">
                <p className="font-display text-h1 text-clay tabular" data-testid="item-price">
                  {formatPrice(listing.price_agorot)}
                </p>
                {listing.original_price_agorot ? (
                  <p className="text-body text-ink-subtle line-through tabular">
                    {formatPrice(listing.original_price_agorot)}
                  </p>
                ) : null}
              </div>
            </div>

            {isSold ? (
              <div className="rounded-lg border border-line bg-sand/50 p-4">
                <p className="text-body text-ink">הפריט הזה נמכר.</p>
                <p className="mt-1 text-body-sm text-ink-muted">
                  הנה כמה פריטים דומים שזמינים עכשיו.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto sm:flex-1">
                  <Link href={`/checkout/new?listing=${listing.id}`}>קנייה</Link>
                </Button>
                <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
                  <Link href={`/item/${listing.slug}/offer`}>הגשת הצעה</Link>
                </Button>
              </div>
            )}

            {!isSold ? <FavoriteButton listingId={listing.id} /> : null}

            <dl className="divide-y divide-line rounded-lg border border-line bg-surface text-body-sm">
              <Spec label="מצב" value={CONDITION_LABELS[listing.condition]} />
              <Spec
                label="מידות (ר×ע×ג)"
                value={
                  <span className="ltr-isolate tabular">
                    {formatDimensions(listing.width_cm, listing.depth_cm, listing.height_cm)} ס״מ
                  </span>
                }
              />
              {brandName ? <Spec label="מותג" value={brandName} /> : null}
              {listing.categories ? <Spec label="קטגוריה" value={listing.categories.name_he} /> : null}
              <Spec label="עיר" value={listing.pickup_city} />
              {listing.needs_disassembly ? <Spec label="פירוק והרכבה" value="נדרש" /> : null}
            </dl>

            {!isSold ? (
              <DeliveryEstimator listing={pricingListing} config={config} zones={zones} />
            ) : null}

            {listing.allow_self_pickup && !isSold ? (
              <p className="text-body-sm text-ink-muted">
                איסוף עצמי — ללא עלות הובלה. פרטי המוכר נמסרים אחרי התשלום.
              </p>
            ) : null}

            {/* Public identity only: first name plus last initial and the
                city. Never the phone number, never the street address. [D-06] */}
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="text-caption font-medium text-ink-muted">המוכר</h2>
              <p className="mt-1 text-body text-ink">{publicName(seller?.full_name)}</p>
              <p className="text-body-sm text-ink-muted">{seller?.city ?? listing.pickup_city}</p>
            </div>
          </div>
        </div>
      </div>

      {listing.description ? (
        <section className="mt-12 max-w-3xl">
          <h2 className="text-h2 text-ink">תיאור</h2>
          <p className="mt-4 whitespace-pre-line text-body-lg text-ink-muted">{listing.description}</p>
        </section>
      ) : null}

      {similar.length > 0 ? (
        <section className="mt-16">
          <h2 className="text-h2 text-ink">פריטים דומים</h2>
          <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
            {similar.map((item) => (
              <ListingCard key={item.id} listing={item} />
            ))}
          </div>
        </section>
      ) : null}
    </Container>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
