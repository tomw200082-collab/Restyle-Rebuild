'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase/service';
import { createServerSupabase } from '@/lib/supabase/server';
import { getUserOrNull } from '@/lib/auth/session';
import { RATE_LIMITED_MESSAGE, RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { getSiteConfig, getDeliveryZones, zoneLookupFrom } from '@/lib/pricing/config';
import { computeOrderPricing, OutOfServiceAreaError } from '@/lib/pricing/engine';
import { getPaymentProvider } from '@/lib/payments';
import { invalidateFromAction } from '@/lib/cache/invalidate';
import type { Json } from '@/types/database';

const checkoutSchema = z
  .object({
    listingId: z.string().uuid(),
    offerId: z.string().uuid().nullable().optional(),
    delivery_method: z.enum(['platform', 'self_pickup']),
    dropoff_city: z.string().optional(),
    dropoff_street: z.string().optional(),
    dropoff_floor: z.number().int().min(0).max(99).optional(),
    dropoff_has_elevator: z.boolean().optional(),
    dropoff_notes: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      v.delivery_method === 'self_pickup' ||
      (Boolean(v.dropoff_city) && (v.dropoff_street ?? '').trim().length >= 3),
    { message: 'צריך כתובת מלאה למסירה', path: ['dropoff_street'] },
  );

export type CheckoutResult = { ok: false; error: string };

/**
 * Creates the order and starts payment.
 *
 * The price is recomputed here from the listing and the config — the client's
 * total is a display artefact and is never an input. A crafted request cannot
 * set its own delivery fee to zero. [D-19]
 */
export async function startCheckout(raw: unknown): Promise<CheckoutResult> {
  const user = await getUserOrNull();
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לרכוש' };

  const limit = await consumeRateLimit(RATE_LIMITS.checkout, user.id);
  if (!limit.allowed) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'הפרטים אינם תקינים' };
  }
  const input = parsed.data;

  const supabase = await createServerSupabase();
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    // A single literal, not a concatenation: supabase-js infers the row type
    // from the select string, and a built-up string collapses it to unknown.
    .select(
      `id, seller_id, title, price_agorot, status, pickup_city, pickup_floor,
       pickup_has_elevator, needs_disassembly, allow_self_pickup, commission_pct_override,
       size_class`,
    )
    .eq('id', input.listingId)
    .maybeSingle();
  if (listingError) throw listingError;

  if (!listing) return { ok: false, error: 'הפריט לא נמצא' };
  if (listing.status !== 'active') return { ok: false, error: 'הפריט כבר אינו זמין לרכישה' };
  if (listing.seller_id === user.id) return { ok: false, error: 'אי אפשר לרכוש פריט של עצמכם' };
  if (input.delivery_method === 'self_pickup' && !listing.allow_self_pickup) {
    return { ok: false, error: 'המוכר לא מאפשר איסוף עצמי בפריט הזה' };
  }

  // An accepted offer sets the price, and the commission follows the price
  // actually paid rather than the asking price. [D-09]
  let itemPriceOverride: number | undefined;
  if (input.offerId) {
    const { data: offer, error: offerError } = await supabase
      .from('offers')
      .select('id, buyer_id, listing_id, status, amount_agorot, counter_amount_agorot, checkout_expires_at')
      .eq('id', input.offerId)
      .maybeSingle();
    if (offerError) throw offerError;

    if (!offer || offer.buyer_id !== user.id || offer.listing_id !== listing.id) {
      return { ok: false, error: 'ההצעה לא נמצאה' };
    }
    if (offer.status !== 'accepted') return { ok: false, error: 'ההצעה אינה פעילה' };
    if (offer.checkout_expires_at && new Date(offer.checkout_expires_at) < new Date()) {
      return { ok: false, error: 'חלון הרכישה של ההצעה הסתיים' };
    }
    itemPriceOverride = offer.counter_amount_agorot ?? offer.amount_agorot;
  }

  const [config, zones] = await Promise.all([getSiteConfig(), getDeliveryZones()]);

  let pricing;
  try {
    pricing = computeOrderPricing(
      listing,
      input.delivery_method === 'self_pickup'
        ? { method: 'self_pickup' }
        : {
            method: 'platform',
            city: input.dropoff_city!,
            floor: input.dropoff_floor ?? 0,
            hasElevator: input.dropoff_has_elevator ?? false,
          },
      config,
      zoneLookupFrom(zones),
      itemPriceOverride !== undefined ? { itemPriceOverride } : {},
    );
  } catch (err) {
    if (err instanceof OutOfServiceAreaError) return { ok: false, error: err.message };
    return { ok: false, error: 'לא הצלחנו לחשב את עלות ההזמנה' };
  }

  // create_order locks the listing, verifies it is still active, inserts the
  // order and reserves the listing in one statement — the reservation the
  // legacy app only appeared to have. [LI 4]
  const service = createServiceSupabase();
  const { data: order, error: createError } = await service.rpc('create_order', {
    p_listing_id: listing.id,
    p_buyer_id: user.id,
    p_item_agorot: pricing.item_agorot,
    p_delivery_agorot: pricing.delivery_agorot,
    p_surcharges: pricing.surcharges as unknown as Json,
    p_surcharges_agorot: pricing.surcharges_agorot,
    p_total_agorot: pricing.total_agorot,
    p_commission_agorot: pricing.commission_agorot,
    p_seller_payout_agorot: pricing.seller_payout_agorot,
    p_delivery_method: input.delivery_method,
    p_payment_provider: getPaymentProvider().name,
    p_offer_id: input.offerId ?? null,
    p_dropoff_city: input.dropoff_city ?? null,
    p_dropoff_street: input.dropoff_street ?? null,
    p_dropoff_floor: input.dropoff_floor ?? null,
    p_dropoff_has_elevator: input.dropoff_has_elevator ?? null,
    p_dropoff_notes: input.dropoff_notes ?? null,
  });

  if (createError || !order) {
    // The most likely cause is somebody else reserving it first — first
    // capture wins, by design. [D-15]
    return { ok: false, error: 'הפריט כבר אינו זמין לרכישה' };
  }

  const session = await getPaymentProvider().createCheckout({
    id: order.id,
    total_agorot: order.total_agorot,
    description: listing.title,
    buyerEmail: user.email,
  });

  await service.from('orders').update({ payment_ref: session.ref }).eq('id', order.id);
  invalidateFromAction('listing_updated', { listingId: listing.id });

  redirect(session.redirectUrl);
}
