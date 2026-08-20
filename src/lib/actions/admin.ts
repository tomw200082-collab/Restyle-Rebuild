'use server';

import { z } from 'zod';
import { getUserOrNull } from '@/lib/auth/session';
import { createServiceSupabase } from '@/lib/supabase/service';
import {
  markListingSoldForOrder,
  recordOrderEvent,
  releaseListingForOrder,
  transitionOrder,
} from '@/lib/db/orders';
import { getPaymentProvider } from '@/lib/payments';
import { getNotificationProvider } from '@/lib/notifications';
import { invalidateFromAction } from '@/lib/cache/invalidate';
import { isSlotAllowed } from '@/lib/scheduling';
import type { Json } from '@/types/database';

export type AdminResult = { ok: true } | { ok: false; error: string };

/**
 * Every action here re-checks the admin role before touching anything.
 * These paths use the service client, which bypasses RLS entirely, so the
 * check in this function IS the authorization — not a convenience. [D-28]
 */
async function requireAdminUser() {
  const user = await getUserOrNull();
  if (!user?.isAdmin) return null;
  return user;
}

// ---------------------------------------------------------------------------
// Curation
// ---------------------------------------------------------------------------

const reviewSchema = z.object({
  listingId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
});

export async function reviewListing(raw: unknown): Promise<AdminResult> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: 'אין הרשאה' };

  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'בקשה לא תקינה' };

  // A rejection without a reason is a support ticket. The database enforces
  // this too, but the message here is the one the admin actually reads.
  if (parsed.data.decision === 'reject' && !parsed.data.reason) {
    return { ok: false, error: 'חובה לכתוב סיבת דחייה — היא נשלחת למוכר' };
  }

  const service = createServiceSupabase();
  const { data: listing, error: listingError } = await service
    .from('listings')
    .select('id, seller_id, status, categories ( slug ), brands ( slug ), pickup_city')
    .eq('id', parsed.data.listingId)
    .maybeSingle();
  if (listingError) throw listingError;

  if (!listing) return { ok: false, error: 'הפריט לא נמצא' };
  if (listing.status !== 'pending_review') return { ok: false, error: 'הפריט אינו ממתין לאישור' };

  const { error } = await service.rpc('transition_listing', {
    p_listing_id: listing.id,
    p_to: parsed.data.decision === 'approve' ? 'active' : 'rejected',
    p_actor: admin.id,
    p_reason: parsed.data.reason ?? null,
  });

  if (error) return { ok: false, error: 'לא הצלחנו לעדכן את הפריט' };

  await getNotificationProvider().send({
    template: parsed.data.decision === 'approve' ? 'listing_approved' : 'listing_rejected',
    to: listing.seller_id,
    listingId: listing.id,
    recipientRole: 'seller',
    idempotencyKey: `${parsed.data.decision}:${listing.id}`,
    data: { reason: parsed.data.reason },
  });

  invalidateFromAction('listing_published', {
    listingId: listing.id,
    categorySlug: listing.categories?.slug,
    brandSlug: listing.brands?.slug,
    city: listing.pickup_city,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delivery scheduling
// ---------------------------------------------------------------------------

const scheduleSchema = z.object({
  orderId: z.string().uuid(),
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickup_shift: z.enum(['morning', 'afternoon', 'evening']),
  dropoff_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dropoff_shift: z.enum(['morning', 'afternoon', 'evening']),
  crew_name: z.string().trim().min(2).max(80),
  crew_phone: z.string().trim().min(7).max(20),
  admin_notes: z.string().trim().max(1000).optional(),
});

export async function scheduleDelivery(raw: unknown): Promise<AdminResult> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: 'אין הרשאה' };

  const parsed = scheduleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'חסרים פרטי שיבוץ' };
  const input = parsed.data;

  // Same calendar rules the seller's picker enforces — no Saturdays, Friday
  // mornings only. An appointment nobody keeps costs a dispatched crew. [D-32]
  for (const [date, shift] of [
    [input.pickup_date, input.pickup_shift],
    [input.dropoff_date, input.dropoff_shift],
  ] as const) {
    if (!isSlotAllowed({ date, shift })) {
      return { ok: false, error: 'אחד המועדים אינו חוקי (אין איסוף בשבת, ובשישי רק בבוקר)' };
    }
  }

  if (input.dropoff_date < input.pickup_date) {
    return { ok: false, error: 'מועד המסירה לא יכול להיות לפני מועד האיסוף' };
  }

  const service = createServiceSupabase();
  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, status, buyer_id, seller_id, listing_id')
    .eq('id', input.orderId)
    .maybeSingle();
  if (orderError) throw orderError;

  if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' };
  if (order.status !== 'confirmed') return { ok: false, error: 'ההזמנה אינה מוכנה לשיבוץ' };

  await service.from('deliveries').upsert(
    {
      order_id: order.id,
      pickup_date: input.pickup_date,
      pickup_shift: input.pickup_shift,
      dropoff_date: input.dropoff_date,
      dropoff_shift: input.dropoff_shift,
      crew_name: input.crew_name,
      crew_phone: input.crew_phone,
      admin_notes: input.admin_notes ?? null,
      status: 'scheduled',
    },
    { onConflict: 'order_id' },
  );

  await transitionOrder(order.id, 'delivery_scheduled', admin.id, 'delivery_scheduled', {
    pickup_date: input.pickup_date,
    dropoff_date: input.dropoff_date,
    crew_name: input.crew_name,
  });

  for (const [to, role] of [
    [order.buyer_id, 'buyer'],
    [order.seller_id, 'seller'],
  ] as const) {
    await getNotificationProvider().send({
      template: 'delivery_scheduled',
      to,
      orderId: order.id,
      recipientRole: role,
      idempotencyKey: `delivery_scheduled:${order.id}:${role}`,
      data: { date: input.dropoff_date, shift: input.dropoff_shift },
    });
  }

  invalidateFromAction('listing_updated', { listingId: order.listing_id });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pickup and delivery
// ---------------------------------------------------------------------------

const pickupSchema = z.object({
  orderId: z.string().uuid(),
  inspectionOk: z.boolean(),
  note: z.string().trim().max(1000).optional(),
});

/**
 * The crew inspects at pickup. That inspection is what makes buyer protection
 * a mechanism rather than a promise — a mismatch stops the transaction before
 * it becomes the buyer's problem, with a full refund. [D-12]
 */
export async function markPickedUp(raw: unknown): Promise<AdminResult> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: 'אין הרשאה' };

  const parsed = pickupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'בקשה לא תקינה' };

  const service = createServiceSupabase();
  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, status, total_agorot, payment_ref, paid_at, buyer_id, listing_id')
    .eq('id', parsed.data.orderId)
    .maybeSingle();
  if (orderError) throw orderError;

  if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' };
  if (order.status !== 'delivery_scheduled') return { ok: false, error: 'ההזמנה אינה משובצת' };

  await service
    .from('deliveries')
    .update({
      inspection_ok: parsed.data.inspectionOk,
      inspection_note: parsed.data.note ?? null,
      status: parsed.data.inspectionOk ? 'picked_up' : 'failed',
    })
    .eq('order_id', order.id);

  if (!parsed.data.inspectionOk) {
    await transitionOrder(order.id, 'cancelled', admin.id, 'inspection_failed', {
      reason: 'inspection_mismatch',
      note: parsed.data.note ?? null,
    });

    if (order.paid_at) {
      const refund = await getPaymentProvider().refund(
        { id: order.id, total_agorot: order.total_agorot, description: '', buyerEmail: '' },
        order.total_agorot,
        order.payment_ref,
      );
      await recordOrderEvent(
        order.id,
        admin.id,
        refund.ok ? 'refund_issued' : 'refund_failed',
        refund.ok
          ? { ref: refund.ref, amount_agorot: order.total_agorot, reason: 'inspection_mismatch' }
          : { error: refund.error },
      );
      if (refund.ok) {
        await service
          .from('orders')
          .update({ refund_agorot: order.total_agorot, refunded_at: new Date().toISOString() })
          .eq('id', order.id);
      }
    }

    await releaseListingForOrder(order.id, admin.id);
    await getNotificationProvider().send({
      template: 'order_cancelled_refund',
      to: order.buyer_id,
      orderId: order.id,
      recipientRole: 'buyer',
      idempotencyKey: `inspection_cancel:${order.id}`,
    });
  } else {
    await transitionOrder(order.id, 'picked_up', admin.id, 'picked_up', {});
  }

  invalidateFromAction('listing_updated', { listingId: order.listing_id });
  return { ok: true };
}

export async function markDelivered(orderId: string): Promise<AdminResult> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: 'אין הרשאה' };

  const service = createServiceSupabase();
  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, status, buyer_id, listing_id')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) throw orderError;

  if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' };
  if (order.status !== 'picked_up') return { ok: false, error: 'הפריט עדיין לא נאסף' };

  await transitionOrder(order.id, 'delivered', admin.id, 'delivered', {});
  await service.from('deliveries').update({ status: 'delivered' }).eq('order_id', order.id);
  await markListingSoldForOrder(order.id, admin.id);

  await getNotificationProvider().send({
    template: 'buyer_delivered',
    to: order.buyer_id,
    orderId: order.id,
    recipientRole: 'buyer',
    idempotencyKey: `delivered:${order.id}`,
    data: { hours: 48 },
  });

  invalidateFromAction('listing_unpublished', { listingId: order.listing_id });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export async function markPayoutPaid(payoutId: string, methodNote: string): Promise<AdminResult> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: 'אין הרשאה' };
  if (!methodNote.trim()) return { ok: false, error: 'הזינו אופן העברה (למשל: העברה בנקאית)' };

  const service = createServiceSupabase();
  const { data: payout, error: payoutError } = await service
    .from('payouts')
    .select('id, order_id, seller_id, amount_agorot, status')
    .eq('id', payoutId)
    .maybeSingle();
  if (payoutError) throw payoutError;

  if (!payout) return { ok: false, error: 'התשלום לא נמצא' };
  if (payout.status === 'paid') return { ok: false, error: 'התשלום כבר סומן כשולם' };

  await service
    .from('payouts')
    .update({ status: 'paid', paid_at: new Date().toISOString(), method_note: methodNote.trim() })
    .eq('id', payout.id);

  await recordOrderEvent(payout.order_id, admin.id, 'payout_paid', {
    amount_agorot: payout.amount_agorot,
    method: methodNote.trim(),
  });

  await getNotificationProvider().send({
    template: 'payout_paid',
    to: payout.seller_id,
    orderId: payout.order_id,
    recipientRole: 'seller',
    idempotencyKey: `payout_paid:${payout.id}`,
    data: { amount: String(payout.amount_agorot / 100) },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

const resolveSchema = z.object({
  disputeId: z.string().uuid(),
  resolution: z.enum(['resolved_refund', 'resolved_partial', 'rejected']),
  refund_agorot: z.number().int().min(0).optional(),
  note: z.string().trim().min(3).max(1000),
});

export async function resolveDispute(raw: unknown): Promise<AdminResult> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: 'אין הרשאה' };

  const parsed = resolveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'חסרים פרטי החלטה' };

  const service = createServiceSupabase();
  const { data: dispute, error: disputeError } = await service
    .from('disputes')
    .select('id, order_id, status, opened_by')
    .eq('id', parsed.data.disputeId)
    .maybeSingle();
  if (disputeError) throw disputeError;

  if (!dispute) return { ok: false, error: 'הבירור לא נמצא' };
  if (dispute.status !== 'open') return { ok: false, error: 'הבירור כבר טופל' };

  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, status, total_agorot, payment_ref, seller_payout_agorot, seller_id, listing_id')
    .eq('id', dispute.order_id)
    .maybeSingle();
  if (orderError) throw orderError;

  if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' };

  const refundAmount =
    parsed.data.resolution === 'resolved_refund'
      ? order.total_agorot
      : parsed.data.resolution === 'resolved_partial'
        ? (parsed.data.refund_agorot ?? 0)
        : 0;

  if (parsed.data.resolution === 'resolved_partial') {
    if (refundAmount <= 0) return { ok: false, error: 'הזינו סכום החזר חלקי' };
    if (refundAmount >= order.total_agorot) {
      return { ok: false, error: 'החזר חלקי צריך להיות קטן מהסכום המלא' };
    }
  }

  if (refundAmount > 0) {
    const refund = await getPaymentProvider().refund(
      { id: order.id, total_agorot: order.total_agorot, description: '', buyerEmail: '' },
      refundAmount,
      order.payment_ref,
    );
    await recordOrderEvent(
      order.id,
      admin.id,
      refund.ok ? 'refund_issued' : 'refund_failed',
      refund.ok
        ? { ref: refund.ref, amount_agorot: refundAmount, reason: 'dispute' }
        : { error: refund.error, amount_agorot: refundAmount },
    );
    if (refund.ok) {
      await service
        .from('orders')
        .update({ refund_agorot: refundAmount, refunded_at: new Date().toISOString() })
        .eq('id', order.id);
    }
  }

  await service
    .from('disputes')
    .update({
      status: parsed.data.resolution,
      resolution_note: parsed.data.note,
      refund_agorot: refundAmount,
      resolved_at: new Date().toISOString(),
      resolved_by: admin.id,
    })
    .eq('id', dispute.id);

  // A full refund ends the order; anything else completes it and releases the
  // seller's payout, which is why partial refunds reduce the payout too.
  if (parsed.data.resolution === 'resolved_refund') {
    await transitionOrder(order.id, 'refunded', admin.id, 'dispute_resolved', {
      resolution: parsed.data.resolution,
      refund_agorot: refundAmount,
    });
  } else {
    await transitionOrder(order.id, 'completed', admin.id, 'dispute_resolved', {
      resolution: parsed.data.resolution,
      refund_agorot: refundAmount,
    });
    await service.from('payouts').upsert(
      {
        order_id: order.id,
        seller_id: order.seller_id,
        amount_agorot: Math.max(0, order.seller_payout_agorot - refundAmount),
        status: 'pending',
      },
      { onConflict: 'order_id' },
    );
  }

  await getNotificationProvider().send({
    template: 'dispute_resolved',
    to: dispute.opened_by,
    orderId: order.id,
    recipientRole: 'buyer',
    idempotencyKey: `dispute_resolved:${dispute.id}`,
    data: { resolution: parsed.data.note },
  });

  invalidateFromAction('listing_updated', { listingId: order.listing_id });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Runtime config
// ---------------------------------------------------------------------------

export async function updateConfig(key: string, value: string): Promise<AdminResult> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: 'אין הרשאה' };

  const service = createServiceSupabase();
  const { data: existing, error: existingError } = await service
    .from('site_config')
    .select('key, is_public')
    .eq('key', key)
    .maybeSingle();
  if (existingError) throw existingError;

  if (!existing) return { ok: false, error: 'מפתח הגדרה לא קיים' };

  let parsedValue: Json;
  try {
    parsedValue = JSON.parse(value) as Json;
  } catch {
    // Fall back to a string, so a plain "immediate" works without quoting.
    parsedValue = value;
  }

  const { error } = await service
    .from('site_config')
    .update({ value: parsedValue })
    .eq('key', key);

  if (error) return { ok: false, error: 'לא הצלחנו לשמור את ההגדרה' };

  // A fee change alters totals rendered into item pages, so the catalogue is
  // invalidated too — not just the config. [D-46]
  invalidateFromAction('config_changed');
  return { ok: true };
}

export async function updateZoneFee(city: string, feeAgorot: number): Promise<AdminResult> {
  const admin = await requireAdminUser();
  if (!admin) return { ok: false, error: 'אין הרשאה' };
  if (!Number.isInteger(feeAgorot) || feeAgorot < 0) return { ok: false, error: 'סכום לא תקין' };

  const service = createServiceSupabase();
  const { error } = await service
    .from('delivery_zones')
    .update({ fee_agorot: feeAgorot })
    .eq('city', city);

  if (error) return { ok: false, error: 'לא הצלחנו לעדכן את התעריף' };

  invalidateFromAction('config_changed');
  return { ok: true };
}
