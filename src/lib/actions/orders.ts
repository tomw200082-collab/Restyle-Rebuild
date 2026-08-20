'use server';

import { z } from 'zod';
import { getUserOrNull } from '@/lib/auth/session';
import { createServiceSupabase } from '@/lib/supabase/service';
import { getSiteConfig } from '@/lib/pricing/config';
import { getPaymentProvider } from '@/lib/payments';
import {
  recordOrderEvent,
  releaseListingForOrder,
  transitionOrder,
} from '@/lib/db/orders';
import { validateProposedWindows } from '@/lib/scheduling';
import { invalidateFromAction } from '@/lib/cache/invalidate';
import { getNotificationProvider } from '@/lib/notifications';
import type { Json } from '@/types/database';

export type OrderActionResult = { ok: true } | { ok: false; error: string };

const slotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(['morning', 'afternoon', 'evening']),
});

const confirmSchema = z.object({
  orderId: z.string().uuid(),
  windows: z.array(slotSchema).min(2).max(3),
});

/**
 * Seller confirms the sale and proposes pickup windows.
 *
 * This is the step that killed the pilot — 72% of legacy orders died waiting
 * here — so it is deliberately one action with no intermediate state. [D-43]
 */
export async function confirmSale(raw: unknown): Promise<OrderActionResult> {
  const user = await getUserOrNull();
  if (!user) return { ok: false, error: 'צריך להתחבר' };

  const parsed = confirmSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'בחרו 2–3 מועדי איסוף' };

  const windows = validateProposedWindows(parsed.data.windows);
  if (!windows.ok) return { ok: false, error: windows.error };

  const service = createServiceSupabase();
  const { data: order } = await service
    .from('orders')
    .select('id, seller_id, buyer_id, status, paid_at, listing_id')
    .eq('id', parsed.data.orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' };
  // Authorization is checked here, not left to RLS: this path uses the service
  // client, which bypasses RLS entirely. [D-28]
  if (order.seller_id !== user.id) return { ok: false, error: 'ההזמנה אינה שלכם' };
  if (order.status !== 'pending_seller_confirmation') {
    return { ok: false, error: 'ההזמנה כבר אינה ממתינה לאישור' };
  }
  if (!order.paid_at) return { ok: false, error: 'ההזמנה עדיין לא שולמה' };

  await service.from('deliveries').upsert(
    {
      order_id: order.id,
      proposed_windows: parsed.data.windows as unknown as Json,
      status: 'unscheduled',
    },
    { onConflict: 'order_id' },
  );

  await transitionOrder(order.id, 'confirmed', user.id, 'seller_confirmed', {
    proposed_windows: parsed.data.windows as unknown as Json,
  });

  await getNotificationProvider().send({
    template: 'buyer_order_confirmed',
    to: order.buyer_id,
    orderId: order.id,
    recipientRole: 'buyer',
    idempotencyKey: `buyer_order_confirmed:${order.id}`,
  });

  invalidateFromAction('listing_updated', { listingId: order.listing_id });
  return { ok: true };
}

const cancelSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

/**
 * Buyer cancellation. Allowed up to (not including) `picked_up`: once a crew
 * has the item, "cancel" is a logistics problem with a cost attached, which is
 * what the dispute flow exists to adjudicate. [D-11]
 *
 * After the seller has confirmed, the published ₪50 operating fee applies —
 * it is in the Terms and the Cancellation Policy, and the system must match
 * what those documents say. [D-40]
 */
export async function cancelOrderAsBuyer(raw: unknown): Promise<OrderActionResult> {
  const user = await getUserOrNull();
  if (!user) return { ok: false, error: 'צריך להתחבר' };

  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'בקשה לא תקינה' };

  const service = createServiceSupabase();
  const { data: order } = await service
    .from('orders')
    .select('id, buyer_id, status, paid_at, total_agorot, payment_ref, listing_id, confirmed_at')
    .eq('id', parsed.data.orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' };
  if (order.buyer_id !== user.id) return { ok: false, error: 'ההזמנה אינה שלכם' };

  const cancellable = ['pending_seller_confirmation', 'confirmed', 'delivery_scheduled'];
  if (!cancellable.includes(order.status)) {
    return {
      ok: false,
      error:
        order.status === 'picked_up' || order.status === 'delivered'
          ? 'הפריט כבר נאסף. אם יש בעיה, אפשר לפתוח בקשת בירור.'
          : 'לא ניתן לבטל את ההזמנה בשלב הזה',
    };
  }

  const config = await getSiteConfig();
  const fee = order.confirmed_at ? config.cancellation_fee_agorot : 0;
  const refundAmount = Math.max(0, order.total_agorot - fee);

  await transitionOrder(order.id, 'cancelled', user.id, 'cancelled_by_buyer', {
    reason: parsed.data.reason ?? 'buyer_cancelled',
    cancellation_fee_agorot: fee,
  });

  await service
    .from('orders')
    .update({ cancellation_fee_agorot: fee })
    .eq('id', order.id);

  if (order.paid_at && refundAmount > 0) {
    const provider = getPaymentProvider();
    const refund = await provider.refund(
      { id: order.id, total_agorot: order.total_agorot, description: '', buyerEmail: user.email },
      refundAmount,
      order.payment_ref,
    );

    // A failed refund must stay visible: the order is already cancelled, so a
    // silent failure would leave the buyer's money with the platform and no
    // record of why.
    await recordOrderEvent(
      order.id,
      user.id,
      refund.ok ? 'refund_issued' : 'refund_failed',
      refund.ok
        ? { ref: refund.ref, amount_agorot: refundAmount, fee_agorot: fee }
        : { error: refund.error, amount_agorot: refundAmount },
    );

    if (refund.ok) {
      await service
        .from('orders')
        .update({ refund_agorot: refundAmount, refunded_at: new Date().toISOString() })
        .eq('id', order.id);
    }
  }

  await releaseListingForOrder(order.id, user.id);
  invalidateFromAction('listing_updated', { listingId: order.listing_id });

  return { ok: true };
}
