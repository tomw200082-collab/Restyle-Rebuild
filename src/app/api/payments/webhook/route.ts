import { NextResponse, type NextRequest } from 'next/server';
import { getPaymentProvider } from '@/lib/payments';
import { createServiceSupabase } from '@/lib/supabase/service';
import {
  recordOrderEvent,
  releaseListingForOrder,
  transitionOrder,
} from '@/lib/db/orders';
import { invalidateFromRoute } from '@/lib/cache/invalidate';
import { getNotificationProvider } from '@/lib/notifications';
import { getSiteConfig } from '@/lib/pricing/config';

/**
 * PSP callback. The provider verifies the signature and normalises the event;
 * this route applies it.
 *
 * Idempotent by construction: capture is a no-op when `paid_at` is already
 * set, and cancellation goes through the transition function, which treats a
 * repeat of the current status as a no-op that still records the attempt.
 * PSPs retry, and a retried capture must not become a second charge. [D-20]
 */
export async function POST(request: NextRequest) {
  const provider = getPaymentProvider();
  const event = await provider.handleWebhook(request);

  if (event.kind === 'ignored') {
    // 200, deliberately: a PSP that receives an error retries forever. The
    // reason is recorded rather than surfaced.
    console.warn('[payments] ignored webhook:', event.reason);
    return NextResponse.json({ received: true, applied: false });
  }

  const service = createServiceSupabase();
  const { data: order } = await service
    .from('orders')
    .select('id, status, paid_at, total_agorot, listing_id, buyer_id, seller_id')
    .eq('id', event.orderId)
    .maybeSingle();

  if (!order) {
    console.warn('[payments] webhook for unknown order', event.orderId);
    return NextResponse.json({ received: true, applied: false });
  }

  switch (event.kind) {
    case 'captured': {
      if (order.paid_at) {
        return NextResponse.json({ received: true, applied: false, reason: 'already paid' });
      }

      // A capture whose amount disagrees with the order is not applied: it
      // means the two systems disagree about what was charged, and guessing
      // is worse than stopping.
      if (event.amount_agorot && event.amount_agorot !== order.total_agorot) {
        await recordOrderEvent(order.id, null, 'payment_amount_mismatch', {
          expected: order.total_agorot,
          received: event.amount_agorot,
        });
        return NextResponse.json({ received: true, applied: false, reason: 'amount mismatch' });
      }

      await service
        .from('orders')
        .update({ paid_at: new Date().toISOString(), payment_ref: event.ref })
        .eq('id', order.id);

      await recordOrderEvent(order.id, null, 'payment_captured', {
        ref: event.ref,
        amount_agorot: order.total_agorot,
      });

      const config = await getSiteConfig();
      const notify = getNotificationProvider();

      await notify.send({
        template: 'buyer_order_received',
        to: order.buyer_id,
        orderId: order.id,
        recipientRole: 'buyer',
        idempotencyKey: `buyer_order_received:${order.id}`,
        data: { hours: config.seller_confirm_hours },
      });

      // The seller mail is the one that matters: 72% of legacy orders died
      // waiting for a seller who was never told a buyer had already paid. [D-43]
      await notify.send({
        template: 'seller_purchase_request',
        to: order.seller_id,
        orderId: order.id,
        recipientRole: 'seller',
        idempotencyKey: `seller_purchase_request:${order.id}`,
        data: { hours: config.seller_confirm_hours },
      });
      break;
    }

    case 'cancelled':
    case 'failed': {
      if (order.status === 'pending_seller_confirmation' && !order.paid_at) {
        await transitionOrder(order.id, 'cancelled', null, 'payment_not_completed', {
          reason: event.kind === 'failed' ? `payment_failed:${event.reason}` : 'payment_cancelled',
        });
        await releaseListingForOrder(order.id, null);
      }
      break;
    }

    case 'refunded': {
      await recordOrderEvent(order.id, null, 'payment_refunded', {
        ref: event.ref,
        amount_agorot: event.amount_agorot,
      });
      break;
    }
  }

  invalidateFromRoute('listing_updated', { listingId: order.listing_id });
  return NextResponse.json({ received: true, applied: true });
}
