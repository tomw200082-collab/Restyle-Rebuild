import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { CheckoutForm } from '@/components/checkout/checkout-form';
import { requireUser } from '@/lib/auth/session';
import { createServerSupabase } from '@/lib/supabase/server';
import { getDeliveryZones, getSiteConfig } from '@/lib/pricing/config';

export const metadata: Metadata = {
  title: 'השלמת רכישה',
  robots: { index: false, follow: false },
};

export default async function NewCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string; offer?: string }>;
}) {
  const { listing: listingId, offer: offerId } = await searchParams;
  if (!listingId) notFound();

  const user = await requireUser(`/checkout/new?listing=${listingId}`);
  const supabase = await createServerSupabase();

  const { data: listing, error } = await supabase
    .from('listings')
    .select(
      `id, slug, title, price_agorot, status, pickup_city, pickup_floor,
       pickup_has_elevator, needs_disassembly, allow_self_pickup,
       commission_pct_override, seller_id,
       listing_photos ( storage_path, alt_text, sort )`,
    )
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw error;

  if (!listing) notFound();
  if (listing.status !== 'active') redirect(`/item/${listing.slug}`);
  if (listing.seller_id === user.id) redirect(`/item/${listing.slug}`);

  let offerAmount: number | null = null;
  if (offerId) {
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('amount_agorot, counter_amount_agorot, status, checkout_expires_at')
      .eq('id', offerId)
      .eq('buyer_id', user.id)
      .maybeSingle();
    if (offerError) throw offerError;

    if (offer?.status === 'accepted') {
      offerAmount = offer.counter_amount_agorot ?? offer.amount_agorot;
    }
  }

  const [config, zones] = await Promise.all([getSiteConfig(), getDeliveryZones()]);

  return (
    <Container className="py-10">
      <h1 className="font-display text-h1 text-ink">השלמת רכישה</h1>
      <div className="mt-8">
        <CheckoutForm
          listing={listing}
          offerId={offerId ?? null}
          offerAmount={offerAmount}
          config={config}
          zones={zones}
          protectionHours={config.protection_hours}
        />
      </div>
    </Container>
  );
}
