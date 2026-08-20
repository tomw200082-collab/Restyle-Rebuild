import 'server-only';

import { createServiceSupabase } from '@/lib/supabase/service';
import { getSiteConfig } from '@/lib/pricing/config';
import { getPaymentProvider } from '@/lib/payments';
import {
  markListingSoldForOrder,
  recordOrderEvent,
  releaseListingForOrder,
  transitionOrder,
} from '@/lib/db/orders';
import { getNotificationProvider } from '@/lib/notifications';
import { killSwitchState } from '@/lib/ops/kill-switch';

export type JobName =
  | 'seller-timeout'
  | 'seller-reminder'
  | 'abandoned-checkout'
  | 'offer-expiry'
  | 'protection-window'
  | 'listing-expiry'
  | 'housekeeping';

export const JOB_NAMES: JobName[] = [
  'seller-timeout',
  'seller-reminder',
  'abandoned-checkout',
  'offer-expiry',
  'protection-window',
  'listing-expiry',
  'housekeeping',
];

export type JobResult = {
  job: JobName;
  processed: number;
  details?: string[];
  /** Set when the kill switch stopped the job before it did any work. */
  halted?: boolean;
};

/**
 * All jobs share three properties, and each exists because of a specific way
 * the legacy platform's scheduled work failed:
 *
 *  1. **Timing comes from database timestamps, never from invocation time.**
 *     A late or missed run then self-heals on the next tick instead of
 *     silently skipping the orders it should have handled. [D-20]
 *  2. **Every job is idempotent.** Cron delivery is at-least-once, and a
 *     retried auto-cancel must not refund twice.
 *  3. **Nothing is deleted or "cleaned up" destructively.** The legacy
 *     reservation cleaner ran every five minutes, failed five times, and was
 *     disabled — leaving expiry to nothing at all. [LI 5]
 */

/** Sellers who never responded: cancel and refund the buyer in full. */
async function sellerTimeout(now: Date): Promise<JobResult> {
  const config = await getSiteConfig();
  const service = createServiceSupabase();
  const cutoff = new Date(now.getTime() - config.seller_confirm_hours * 3_600_000).toISOString();

  const { data: orders, error: ordersError } = await service
    .from('orders')
    .select('id, buyer_id, seller_id, total_agorot, payment_ref, paid_at, listing_id, created_at')
    .eq('status', 'pending_seller_confirmation')
    .lt('created_at', cutoff)
    .limit(200);
  if (ordersError) throw ordersError;

  const details: string[] = [];
  const unresponsiveSellers = new Set<string>();

  for (const order of orders ?? []) {
    await transitionOrder(order.id, 'cancelled', null, 'seller_confirmation_timeout', {
      // Same greppable shape the legacy job used. [LI 3]
      reason: `system_timeout:pending_seller_confirmation:${config.seller_confirm_hours}h`,
    });

    if (order.paid_at) {
      const provider = getPaymentProvider();
      const refund = await provider.refund(
        { id: order.id, total_agorot: order.total_agorot, description: '', buyerEmail: '' },
        order.total_agorot,
        order.payment_ref,
      );

      await recordOrderEvent(
        order.id,
        null,
        refund.ok ? 'refund_issued' : 'refund_failed',
        refund.ok
          ? { ref: refund.ref, amount_agorot: order.total_agorot, reason: 'seller_timeout' }
          : { error: refund.error, amount_agorot: order.total_agorot },
      );

      if (refund.ok) {
        await service
          .from('orders')
          .update({ refund_agorot: order.total_agorot, refunded_at: now.toISOString() })
          .eq('id', order.id);
      }
    }

    await releaseListingForOrder(order.id, null);
    await getNotificationProvider().send({
      template: 'order_cancelled_refund',
      to: order.buyer_id,
      orderId: order.id,
      recipientRole: 'buyer',
      idempotencyKey: `seller_timeout_buyer:${order.id}`,
      data: { reason: 'seller_timeout' },
    });
    // The seller loses a sale here. Legacy let that happen in silence, which is
    // part of why 72% of orders died at this step with no feedback loop back to
    // the person who could have prevented it. [LI 3]
    await getNotificationProvider().send({
      template: 'seller_timeout_cancelled',
      to: order.seller_id,
      orderId: order.id,
      recipientRole: 'seller',
      idempotencyKey: `seller_timeout_seller:${order.id}`,
    });

    // The listing is the thing still making promises to buyers, so the listing
    // is what stops. Counting per seller *after* the loop rather than inside it
    // means a seller with three orders expiring in the same tick is counted
    // once, not three times — and that is the difference between "stopped
    // answering" and "was asleep for one evening". [D-74]
    unresponsiveSellers.add(order.seller_id);
    details.push(order.id);
  }

  const paused = await pauseUnresponsiveSellers(unresponsiveSellers, config, service);
  if (paused.length) details.push(...paused);

  return { job: 'seller-timeout', processed: details.length, details };
}

/**
 * After `seller_pause_after_expired` consecutive expiries, a seller's other
 * active listings are paused.
 *
 * The counter is consecutive, not cumulative: a seller who missed one
 * confirmation a year ago and has answered every one since is not a problem,
 * and treating them like one is how a safety mechanism becomes a reason to stop
 * selling here. `confirmOrder` resets it to zero.
 *
 * Set the threshold to 0 to disable the automation entirely.
 */
async function pauseUnresponsiveSellers(
  sellerIds: Set<string>,
  config: { seller_pause_after_expired: number },
  service: ReturnType<typeof createServiceSupabase>,
): Promise<string[]> {
  if (!sellerIds.size || config.seller_pause_after_expired <= 0) return [];

  const paused: string[] = [];

  for (const sellerId of sellerIds) {
    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('expired_confirmations')
      .eq('id', sellerId)
      .maybeSingle();
    if (profileError) throw profileError;

    const count = (profile?.expired_confirmations ?? 0) + 1;
    const { error: bumpError } = await service
      .from('profiles')
      .update({ expired_confirmations: count })
      .eq('id', sellerId);
    if (bumpError) throw bumpError;

    if (count < config.seller_pause_after_expired) continue;

    // One SQL call: the pause and every audit row land in one transaction, and
    // the admin console calls the same function, so an admin unpause and a
    // seller-triggered one cannot diverge.
    const { data: pausedCount, error: pauseError } = await service.rpc('pause_seller_listings', {
      p_seller_id: sellerId,
      p_reason: `seller_unresponsive:${count}_consecutive`,
    });
    if (pauseError) throw pauseError;

    // Idempotent by construction: a seller with nothing left to pause is not
    // emailed again on the next tick.
    if (typeof pausedCount === 'number' && pausedCount > 0) {
      await getNotificationProvider().send({
        template: 'seller_listings_paused',
        to: sellerId,
        recipientRole: 'seller',
        idempotencyKey: `seller_paused:${sellerId}:${count}`,
        data: { count: String(count) },
      });
      paused.push(`paused ${pausedCount} listing(s) for seller ${sellerId}`);
    }
  }

  return paused;
}

/**
 * Nudge sellers partway through the window. The master prompt's move from 24h
 * to 48h lengthens the wait without addressing why 72% of legacy orders died
 * here; a reminder is the lever that actually might. [D-43]
 */
async function sellerReminder(now: Date): Promise<JobResult> {
  const config = await getSiteConfig();
  const service = createServiceSupabase();
  const cutoff = new Date(now.getTime() - config.seller_reminder_hours * 3_600_000).toISOString();

  const { data: orders, error: ordersError } = await service
    .from('orders')
    .select('id, seller_id, created_at')
    .eq('status', 'pending_seller_confirmation')
    .not('paid_at', 'is', null)
    .lt('created_at', cutoff)
    .limit(200);
  if (ordersError) throw ordersError;

  let processed = 0;

  for (const order of orders ?? []) {
    // Idempotency comes from the notification layer's key, not from a flag
    // column: a second run produces the same key and is skipped.
    const sent = await getNotificationProvider().send({
      template: 'seller_confirm_reminder',
      to: order.seller_id,
      orderId: order.id,
      idempotencyKey: `seller_reminder:${order.id}`,
      data: { hours_left: config.seller_confirm_hours - config.seller_reminder_hours },
    });
    if (sent) processed += 1;
  }

  return { job: 'seller-reminder', processed };
}

/**
 * Orders created but never paid. The listing is reserved from the moment the
 * order is created, so without this a buyer who closes the tab takes the item
 * off the market indefinitely — precisely what the legacy reservation cleaner
 * was for before it was disabled. [LI 5]
 */
async function abandonedCheckout(now: Date): Promise<JobResult> {
  const service = createServiceSupabase();
  const cutoff = new Date(now.getTime() - 30 * 60_000).toISOString();

  const { data: orders, error: ordersError } = await service
    .from('orders')
    .select('id, listing_id')
    .eq('status', 'pending_seller_confirmation')
    .is('paid_at', null)
    .lt('created_at', cutoff)
    .limit(200);
  if (ordersError) throw ordersError;

  for (const order of orders ?? []) {
    await transitionOrder(order.id, 'cancelled', null, 'checkout_abandoned', {
      reason: 'system_timeout:unpaid_checkout:30m',
    });
    await releaseListingForOrder(order.id, null);
  }

  return { job: 'abandoned-checkout', processed: orders?.length ?? 0 };
}

async function offerExpiry(now: Date): Promise<JobResult> {
  const service = createServiceSupabase();

  const { data: offers, error: offersError } = await service
    .from('offers')
    .select('id')
    .in('status', ['pending', 'countered'])
    .lt('expires_at', now.toISOString())
    .limit(500);
  if (offersError) throw offersError;

  if (offers?.length) {
    await service
      .from('offers')
      .update({ status: 'expired' })
      .in('id', offers.map((o) => o.id));
  }

  // An accepted offer whose exclusive checkout window lapsed also expires,
  // otherwise it stays checkout-able forever at the agreed price.
  const { data: stale, error: staleError } = await service
    .from('offers')
    .select('id')
    .eq('status', 'accepted')
    .lt('checkout_expires_at', now.toISOString())
    .limit(500);
  if (staleError) throw staleError;

  if (stale?.length) {
    await service
      .from('offers')
      .update({ status: 'expired' })
      .in('id', stale.map((o) => o.id));
  }

  return { job: 'offer-expiry', processed: (offers?.length ?? 0) + (stale?.length ?? 0) };
}

/** Protection window elapsed with no dispute: complete the order and queue the payout. */
async function protectionWindow(now: Date): Promise<JobResult> {
  const service = createServiceSupabase();

  const { data: orders, error: ordersError } = await service
    .from('orders')
    .select('id, seller_id, seller_payout_agorot, listing_id')
    .eq('status', 'delivered')
    .lt('protection_expires_at', now.toISOString())
    .limit(200);
  if (ordersError) throw ordersError;

  for (const order of orders ?? []) {
    await transitionOrder(order.id, 'completed', null, 'protection_window_elapsed', {});
    await markListingSoldForOrder(order.id, null);

    // upsert on order_id, so a repeated run cannot create a second payout for
    // the same order — the invariant that matters most in this job.
    await service.from('payouts').upsert(
      {
        order_id: order.id,
        seller_id: order.seller_id,
        amount_agorot: order.seller_payout_agorot,
        status: 'pending',
      },
      { onConflict: 'order_id' },
    );

    await recordOrderEvent(order.id, null, 'payout_queued', {
      amount_agorot: order.seller_payout_agorot,
    });
  }

  return { job: 'protection-window', processed: orders?.length ?? 0 };
}

/** Stale listings rot the catalogue and poison search with unavailable items. */
async function listingExpiry(now: Date): Promise<JobResult> {
  const service = createServiceSupabase();

  const { data: listings, error: listingsError } = await service
    .from('listings')
    .select('id')
    .eq('status', 'active')
    .lt('expires_at', now.toISOString())
    .limit(500);
  if (listingsError) throw listingsError;

  for (const listing of listings ?? []) {
    await service.rpc('transition_listing', {
      p_listing_id: listing.id,
      p_to: 'expired',
      p_actor: null,
    });
  }

  return { job: 'listing-expiry', processed: listings?.length ?? 0 };
}

/**
 * Bounded-growth tables that nothing reads once they are old.
 *
 * Rate-limit windows accumulate a row per subject per window forever
 * otherwise — a table that only ever grows, on the hot path of every limited
 * action. Pruned on a schedule rather than by trigger, so a traffic burst never
 * pays for the cleanup.
 */
async function housekeeping(): Promise<JobResult> {
  const service = createServiceSupabase();

  const { data, error } = await service.rpc('prune_rate_limits', { p_older_than: '2 days' });
  if (error) throw error;

  return { job: 'housekeeping', processed: typeof data === 'number' ? data : 0 };
}

/** `now` is injectable so the timing logic is unit-testable without waiting. */
export async function runJob(job: JobName, now: Date = new Date()): Promise<JobResult> {
  // One guard, seven jobs. Every scheduled job routes through here, so the
  // kill switch cannot be forgotten on the next one that gets added — a check
  // per job would be seven places to forget it. It runs before any query,
  // any transition and any refund: halting has to mean nothing happened.
  // CLAUDE.md §6, EXECUTION_POLICY.md.
  const kill = killSwitchState();
  if (kill.active) {
    return { job, processed: 0, halted: true, details: [`kill switch active (${kill.detail})`] };
  }

  switch (job) {
    case 'seller-timeout':
      return sellerTimeout(now);
    case 'seller-reminder':
      return sellerReminder(now);
    case 'abandoned-checkout':
      return abandonedCheckout(now);
    case 'offer-expiry':
      return offerExpiry(now);
    case 'protection-window':
      return protectionWindow(now);
    case 'listing-expiry':
      return listingExpiry(now);
    case 'housekeeping':
      return housekeeping();
  }
}
