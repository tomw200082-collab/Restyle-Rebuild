'use server';

import { z } from 'zod';
import { getUserOrNull } from '@/lib/auth/session';
import { createServiceSupabase } from '@/lib/supabase/service';
import { getSiteConfig } from '@/lib/pricing/config';
import { minimumOfferAgorot } from '@/lib/pricing/engine';
import { formatPrice } from '@/lib/format';
import { getNotificationProvider } from '@/lib/notifications';

export type OfferResult = { ok: true; offerId: string } | { ok: false; error: string };
export type OfferActionResult = { ok: true } | { ok: false; error: string };

const submitSchema = z.object({
  listingId: z.string().uuid(),
  amount_agorot: z.number().int().min(5000),
});

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/**
 * Buyer submits an offer.
 *
 * The listing stays purchasable at full price throughout — a lowball offer
 * must not take scarce supply off the market for free. First capture wins. [D-15]
 */
export async function submitOffer(raw: unknown): Promise<OfferResult> {
  const user = await getUserOrNull();
  if (!user) return { ok: false, error: 'צריך להתחבר כדי להגיש הצעה' };

  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'הזינו סכום תקין' };

  const service = createServiceSupabase();
  const { data: listing, error: listingError } = await service
    .from('listings')
    .select('id, seller_id, status, price_agorot')
    .eq('id', parsed.data.listingId)
    .maybeSingle();
  if (listingError) throw listingError;

  if (!listing) return { ok: false, error: 'הפריט לא נמצא' };
  if (listing.status !== 'active') return { ok: false, error: 'הפריט אינו זמין להצעות' };
  if (listing.seller_id === user.id) return { ok: false, error: 'אי אפשר להגיש הצעה על פריט שלכם' };

  const config = await getSiteConfig();
  const minimum = minimumOfferAgorot(listing.price_agorot, config);
  if (parsed.data.amount_agorot < minimum) {
    return { ok: false, error: `ההצעה המינימלית היא ${formatPrice(minimum)}` };
  }
  if (parsed.data.amount_agorot >= listing.price_agorot) {
    return { ok: false, error: 'ההצעה גבוהה מהמחיר המבוקש — אפשר פשוט לרכוש' };
  }

  const { data: offer, error } = await service
    .from('offers')
    .insert({
      listing_id: listing.id,
      buyer_id: user.id,
      amount_agorot: parsed.data.amount_agorot,
      status: 'pending',
      expires_at: hoursFromNow(config.offer_expiry_hours),
    })
    .select('id')
    .single();

  if (error || !offer) {
    // The partial unique index allows one live offer per buyer per listing.
    return { ok: false, error: 'כבר יש לכם הצעה פעילה על הפריט הזה' };
  }

  await getNotificationProvider().send({
    template: 'offer_received',
    to: listing.seller_id,
    listingId: listing.id,
    recipientRole: 'seller',
    idempotencyKey: `offer_received:${offer.id}`,
    data: {
      amount: formatPrice(parsed.data.amount_agorot),
      price: formatPrice(listing.price_agorot),
      hours: config.offer_expiry_hours,
    },
  });

  return { ok: true, offerId: offer.id };
}

const respondSchema = z.object({
  offerId: z.string().uuid(),
  action: z.enum(['accept', 'decline', 'counter']),
  counter_amount_agorot: z.number().int().min(5000).optional(),
});

/**
 * Seller accepts, declines or counters. One counter round only — more turns
 * into chat (out of scope) and holds scarce supply longer. [D-15]
 */
export async function respondToOffer(raw: unknown): Promise<OfferActionResult> {
  const user = await getUserOrNull();
  if (!user) return { ok: false, error: 'צריך להתחבר' };

  const parsed = respondSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'בקשה לא תקינה' };

  const service = createServiceSupabase();
  const { data: offer, error: offerError } = await service
    .from('offers')
    .select('id, listing_id, buyer_id, status, amount_agorot, expires_at, listings ( seller_id, price_agorot, status )')
    .eq('id', parsed.data.offerId)
    .maybeSingle();
  if (offerError) throw offerError;

  if (!offer) return { ok: false, error: 'ההצעה לא נמצאה' };
  if (offer.listings?.seller_id !== user.id) return { ok: false, error: 'ההצעה אינה שלכם' };
  if (offer.status !== 'pending') return { ok: false, error: 'כבר הגבתם להצעה הזו' };
  if (new Date(offer.expires_at) < new Date()) return { ok: false, error: 'ההצעה פגה' };

  const config = await getSiteConfig();

  if (parsed.data.action === 'decline') {
    await service
      .from('offers')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', offer.id);

    await getNotificationProvider().send({
      template: 'offer_declined',
      to: offer.buyer_id,
      listingId: offer.listing_id,
      recipientRole: 'buyer',
      idempotencyKey: `offer_declined:${offer.id}`,
    });
    return { ok: true };
  }

  if (parsed.data.action === 'counter') {
    const amount = parsed.data.counter_amount_agorot;
    if (!amount) return { ok: false, error: 'הזינו סכום להצעה הנגדית' };
    if (amount <= offer.amount_agorot) {
      return { ok: false, error: 'ההצעה הנגדית צריכה להיות גבוהה מההצעה המקורית' };
    }
    if (offer.listings && amount >= offer.listings.price_agorot) {
      return { ok: false, error: 'ההצעה הנגדית צריכה להיות נמוכה מהמחיר המבוקש' };
    }

    await service
      .from('offers')
      .update({
        status: 'countered',
        counter_amount_agorot: amount,
        responded_at: new Date().toISOString(),
        expires_at: hoursFromNow(config.offer_expiry_hours),
      })
      .eq('id', offer.id);
    return { ok: true };
  }

  if (offer.listings?.status !== 'active') {
    return { ok: false, error: 'הפריט כבר אינו זמין' };
  }

  // Acceptance opens an exclusive checkout window but does NOT reserve the
  // listing: it stays purchasable at full price until the offer-holder
  // actually pays. [D-15]
  await service
    .from('offers')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
      checkout_expires_at: hoursFromNow(config.offer_checkout_hours),
    })
    .eq('id', offer.id);

  await getNotificationProvider().send({
    template: 'offer_accepted',
    to: offer.buyer_id,
    listingId: offer.listing_id,
    recipientRole: 'buyer',
    idempotencyKey: `offer_accepted:${offer.id}`,
    data: {
      amount: formatPrice(offer.amount_agorot),
      hours: config.offer_checkout_hours,
    },
  });

  return { ok: true };
}

/** Buyer accepts a counter-offer, which turns it into the agreed price. */
export async function acceptCounterOffer(offerId: string): Promise<OfferActionResult> {
  const user = await getUserOrNull();
  if (!user) return { ok: false, error: 'צריך להתחבר' };

  const service = createServiceSupabase();
  const { data: offer, error: offerError } = await service
    .from('offers')
    .select('id, buyer_id, status, counter_amount_agorot, expires_at')
    .eq('id', offerId)
    .maybeSingle();
  if (offerError) throw offerError;

  if (!offer) return { ok: false, error: 'ההצעה לא נמצאה' };
  if (offer.buyer_id !== user.id) return { ok: false, error: 'ההצעה אינה שלכם' };
  if (offer.status !== 'countered') return { ok: false, error: 'אין הצעה נגדית לאשר' };
  if (new Date(offer.expires_at) < new Date()) return { ok: false, error: 'ההצעה פגה' };

  const config = await getSiteConfig();
  await service
    .from('offers')
    .update({
      status: 'accepted',
      checkout_expires_at: hoursFromNow(config.offer_checkout_hours),
    })
    .eq('id', offer.id);

  return { ok: true };
}
