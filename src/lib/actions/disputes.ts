'use server';

import { z } from 'zod';
import { getUserOrNull } from '@/lib/auth/session';
import { RATE_LIMITED_MESSAGE, RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { createServiceSupabase } from '@/lib/supabase/service';
import { transitionOrder } from '@/lib/db/orders';
import { getNotificationProvider } from '@/lib/notifications';

export type DisputeResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  orderId: z.string().uuid(),
  reason: z.enum(['not_as_described', 'damaged', 'wrong_item', 'missing_parts']),
  description: z.string().trim().min(10, { message: 'תארו את הבעיה בכמה מילים לפחות' }).max(2000),
  photo_paths: z.array(z.string()).max(10).default([]),
});

/**
 * Opening a dispute freezes the seller's payout — the protection-window job
 * only completes orders still in `delivered`, so moving to `disputed` is what
 * stops the money. [D-13]
 */
export async function openDispute(raw: unknown): Promise<DisputeResult> {
  const user = await getUserOrNull();
  if (!user) return { ok: false, error: 'צריך להתחבר' };

  const limit = await consumeRateLimit(RATE_LIMITS.dispute, user.id);
  if (!limit.allowed) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'הפרטים אינם תקינים' };
  }

  const service = createServiceSupabase();
  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, buyer_id, status, protection_expires_at')
    .eq('id', parsed.data.orderId)
    .maybeSingle();
  if (orderError) throw orderError;

  if (!order) return { ok: false, error: 'ההזמנה לא נמצאה' };
  if (order.buyer_id !== user.id) return { ok: false, error: 'ההזמנה אינה שלכם' };
  if (order.status !== 'delivered') {
    return { ok: false, error: 'אפשר לפתוח בקשת בירור רק אחרי שהפריט נמסר' };
  }
  if (order.protection_expires_at && new Date(order.protection_expires_at) < new Date()) {
    return { ok: false, error: 'חלון הבדיקה הסתיים' };
  }

  const { error } = await service.from('disputes').insert({
    order_id: order.id,
    opened_by: user.id,
    reason: parsed.data.reason,
    description: parsed.data.description,
    photo_paths: parsed.data.photo_paths,
    status: 'open',
  });

  if (error) return { ok: false, error: 'כבר קיימת בקשת בירור פתוחה על ההזמנה הזו' };

  await transitionOrder(order.id, 'disputed', user.id, 'dispute_opened', {
    reason: parsed.data.reason,
  });

  await getNotificationProvider().send({
    template: 'dispute_received',
    to: user.id,
    orderId: order.id,
    recipientRole: 'buyer',
    idempotencyKey: `dispute_received:${order.id}`,
  });

  return { ok: true };
}
