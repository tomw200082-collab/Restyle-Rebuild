import 'server-only';

import { createServerSupabase } from '@/lib/supabase/server';
import { createServiceSupabase } from '@/lib/supabase/service';
import type { Enums, Json } from '@/types/database';

/** JSON-serialisable payload for order_events. */
export type EventPayload = Record<string, Json>;

const ORDER_COLUMNS = `
  id, status, item_agorot, delivery_agorot, surcharges, surcharges_agorot,
  total_agorot, commission_agorot, seller_payout_agorot, refund_agorot,
  cancellation_fee_agorot, delivery_method,
  dropoff_city, dropoff_floor, dropoff_has_elevator, dropoff_notes,
  payment_provider, payment_ref, paid_at, cancellation_reason,
  protection_expires_at, confirmed_at, scheduled_at, picked_up_at,
  delivered_at, completed_at, cancelled_at, created_at,
  listing_id, buyer_id, seller_id, offer_id,
  listings!orders_listing_id_fkey ( id, slug, title, pickup_city, condition,
             listing_photos ( storage_path, alt_text, sort ) )
` as const;

/**
 * `dropoff_street` is deliberately absent from the shared projection: the
 * buyer's address is only needed by the buyer themself and by admin, so it is
 * fetched explicitly where it is genuinely required rather than travelling
 * with every order read. Same principle as the seller's address. [D-06]
 */

export async function getOrderForUser(orderId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listOrdersForBuyer(buyerId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listOrdersForSeller(sellerId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listOrderEvents(orderId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('order_events')
    .select('id, type, payload, created_at, actor_id')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Status changes go through the SQL transition function, never through a
 * direct UPDATE. The function is service_role-only, so this is one of the
 * narrow, audited service-role paths — and every caller checks authorization
 * before reaching it. [D-04], [D-28], [D-44]
 */
export async function transitionOrder(
  orderId: string,
  to: Enums<'order_status'>,
  actorId: string | null,
  eventType: string,
  payload: EventPayload = {},
) {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc('transition_order', {
    p_order_id: orderId,
    p_to: to,
    p_actor: actorId,
    p_event_type: eventType,
    p_payload: payload,
  });

  if (error) throw error;
  return data;
}

export async function recordOrderEvent(
  orderId: string,
  actorId: string | null,
  type: string,
  payload: EventPayload = {},
) {
  const supabase = createServiceSupabase();
  const { error } = await supabase.rpc('record_order_event', {
    p_order_id: orderId,
    p_actor: actorId,
    p_type: type,
    p_payload: payload,
  });
  if (error) throw error;
}

export async function releaseListingForOrder(orderId: string, actorId: string | null) {
  const supabase = createServiceSupabase();
  const { error } = await supabase.rpc('release_listing_for_order', {
    p_order_id: orderId,
    p_actor: actorId,
  });
  if (error) throw error;
}

export async function markListingSoldForOrder(orderId: string, actorId: string | null) {
  const supabase = createServiceSupabase();
  const { error } = await supabase.rpc('mark_listing_sold_for_order', {
    p_order_id: orderId,
    p_actor: actorId,
  });
  if (error) throw error;
}
