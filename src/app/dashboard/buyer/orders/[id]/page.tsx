import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { OrderTimeline } from '@/components/dashboard/order-timeline';
import { BuyerOrderActions } from '@/components/dashboard/buyer-order-actions';
import { requireUser } from '@/lib/auth/session';
import { getOrderForUser, listOrderEvents } from '@/lib/db/orders';
import { getSiteConfig } from '@/lib/pricing/config';
import { formatPrice, hoursUntil } from '@/lib/format';
import { ORDER_STATUS_LABELS, SHIFT_LABELS } from '@/lib/labels';
import { createServerSupabase } from '@/lib/supabase/server';
import { formatShortDate } from '@/lib/format';

export const metadata: Metadata = {
  title: 'פרטי הזמנה',
  robots: { index: false, follow: false },
};

export default async function BuyerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/buyer/orders/${id}`);

  const [order, events, config] = await Promise.all([
    getOrderForUser(id),
    listOrderEvents(id),
    getSiteConfig(),
  ]);

  if (!order || order.buyer_id !== user.id) notFound();

  const supabase = await createServerSupabase();
  const { data: delivery, error } = await supabase
    .from('deliveries')
    .select('dropoff_date, dropoff_shift, status')
    .eq('order_id', order.id)
    .maybeSingle();
  if (error) throw error;

  const confirmDeadline = new Date(
    new Date(order.created_at).getTime() + config.seller_confirm_hours * 3_600_000,
  );

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-h1 text-ink">{order.listings?.title}</h1>
        <Badge tone="clay">{ORDER_STATUS_LABELS[order.status]}</Badge>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {order.status === 'pending_seller_confirmation' ? (
            <p className="rounded-lg border border-line bg-sand/60 px-4 py-3 text-body text-ink-muted">
              ממתינים לאישור המוכר. נותרו לו {hoursUntil(confirmDeadline)} שעות.
              אם לא יאשר, ההזמנה תבוטל והכסף יוחזר לכם אוטומטית במלואו.
            </p>
          ) : null}

          {order.status === 'delivered' && order.protection_expires_at ? (
            <p className="rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-body text-ink">
              הפריט נמסר. יש לכם עוד {hoursUntil(order.protection_expires_at)} שעות לוודא שהכל תקין
              לפני שהתשלום עובר למוכר.
            </p>
          ) : null}

          {delivery?.dropoff_date && delivery.dropoff_shift ? (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 text-body text-ink">
              מועד המסירה: {formatShortDate(`${delivery.dropoff_date}T00:00:00`)},{' '}
              {SHIFT_LABELS[delivery.dropoff_shift]}
            </p>
          ) : null}

          <OrderTimeline events={events} />
        </div>

        <aside className="space-y-4 lg:col-span-5">
          <dl className="space-y-2 rounded-lg border border-line bg-surface p-5 text-body-sm">
            <Row label="מחיר הפריט" value={formatPrice(order.item_agorot)} />
            <Row label="הובלה" value={formatPrice(order.delivery_agorot)} />
            {order.surcharges_agorot > 0 ? (
              <Row label="תוספות" value={formatPrice(order.surcharges_agorot)} />
            ) : null}
            <div className="flex items-baseline justify-between border-t border-line pt-2 text-body font-medium">
              <dt className="text-ink">סה״כ</dt>
              <dd className="text-ink tabular" data-testid="order-total">
                {formatPrice(order.total_agorot)}
              </dd>
            </div>
            {order.refund_agorot > 0 ? (
              <Row label="הוחזר" value={formatPrice(order.refund_agorot)} />
            ) : null}
          </dl>

          <BuyerOrderActions
            orderId={order.id}
            status={order.status}
            cancellationFeeAgorot={order.confirmed_at ? config.cancellation_fee_agorot : 0}
          />
        </aside>
      </div>
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink tabular">{value}</dd>
    </div>
  );
}
