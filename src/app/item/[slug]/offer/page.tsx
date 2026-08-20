import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { OfferForm } from '@/components/item/offer-form';
import { requireUser } from '@/lib/auth/session';
import { getListingBySlug } from '@/lib/db/listings';
import { getSiteConfig } from '@/lib/pricing/config';
import { minimumOfferAgorot } from '@/lib/pricing/engine';

export const metadata: Metadata = {
  title: 'הגשת הצעה',
  robots: { index: false, follow: false },
};

export default async function OfferPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  const user = await requireUser(`/item/${slug}/offer`);
  if (listing.status !== 'active') redirect(`/item/${slug}`);
  if (listing.seller_id === user.id) redirect(`/item/${slug}`);

  const config = await getSiteConfig();

  return (
    <Container className="py-12">
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-h1 text-ink">הגשת הצעה</h1>
        <p className="mt-2 text-body text-ink-muted">{listing.title}</p>

        <OfferForm
          listingId={listing.id}
          slug={listing.slug}
          priceAgorot={listing.price_agorot}
          minimumAgorot={minimumOfferAgorot(listing.price_agorot, config)}
          expiryHours={config.offer_expiry_hours}
          checkoutHours={config.offer_checkout_hours}
        />
      </div>
    </Container>
  );
}
