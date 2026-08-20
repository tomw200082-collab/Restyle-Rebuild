import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { OrderTimeline } from '@/components/dashboard/order-timeline';
import { AdminOrderActions } from '@/components/admin/order-actions';
import { createServiceSupabase } from '@/lib/supabase/service';
import { listOrderEvents } from '@/lib/db/orders';
import { formatPrice, formatShortDate } from '@/lib/format';
import { ORDER_STATUS_LABELS, SHIFT_LABELS } from '@/lib/labels';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הזמנה' };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createServiceSupabase();

  // Admin is the one role that sees both addresses — it is what makes a
  // delivery schedulable. Both are read through the service client, which is
  // the only path with column access to pickup_street. [D-45]
  const [{ data: order }, events, { data: delivery }] = await Promise.all([
    service
      .from('orders')
      .select(
        `id, status, item_agorot, delivery_agorot, surcharges, surcharges_agorot, total_agorot,
         commission_agorot, seller_payout_agorot, refund_agorot, delivery_method,
         dropoff_city, dropoff_street, dropoff_floor, dropoff_has_elevator, dropoff_notes,
         paid_at, created_at, confirmed_at, listing_id,
         listings!orders_listing_id_fkey ( title, pickup_city, pickup_street, pickup_floor,
                                           pickup_has_elevator, needs_disassembly ),
         buyer:profiles!orders_buyer_profile_fk ( full_name, email, phone ),
         seller:profiles!orders_seller_profile_fk ( full_name, email, phone )`,
      )
      .eq('id', id)
      .maybeSingle(),
    listOrderEvents(id),
    service.from('deliveries').select('*').eq('order_id', id).maybeSingle(),
  ]);

  if (!order) notFound();

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-h1 text-ink">{order.listings?.title}</h1>
        <Badge tone="clay">{ORDER_STATUS_LABELS[order.status]}</Badge>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <AdminOrderActions
            orderId={order.id}
            status={order.status}
            proposedWindows={
              (delivery?.proposed_windows as Array<{ date: string; shift: string }> | null) ?? []
            }
            delivery={
              delivery
                ? {
                    pickup_date: delivery.pickup_date,
                    pickup_shift: delivery.pickup_shift,
                    dropoff_date: delivery.dropoff_date,
                    dropoff_shift: delivery.dropoff_shift,
                    crew_name: delivery.crew_name,
                    crew_phone: delivery.crew_phone,
                  }
                : null
            }
          />

          <OrderTimeline events={events} />
        </div>

        <aside className="space-y-4 lg:col-span-5">
          <section className="rounded-lg border border-line bg-surface p-4 text-body-sm">
            <h2 className="text-caption font-medium text-ink-muted">כספים</h2>
            <dl className="mt-2 space-y-1">
              <Row label="פריט" value={formatPrice(order.item_agorot)} />
              <Row label="הובלה" value={formatPrice(order.delivery_agorot)} />
              <Row label="תוספות" value={formatPrice(order.surcharges_agorot)} />
              <Row label="סה״כ" value={formatPrice(order.total_agorot)} strong />
              <Row label="עמלה" value={formatPrice(order.commission_agorot)} />
              <Row label="למוכר" value={formatPrice(order.seller_payout_agorot)} strong />
              {order.refund_agorot > 0 ? (
                <Row label="הוחזר" value={formatPrice(order.refund_agorot)} />
              ) : null}
              <Row label="שולם" value={order.paid_at ? formatShortDate(order.paid_at) : 'לא שולם'} />
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-surface p-4 text-body-sm">
            <h2 className="text-caption font-medium text-ink-muted">איסוף — מוכר</h2>
            <p className="mt-2 text-ink">{order.seller?.full_name}</p>
            <p className="text-ink-muted ltr-isolate">{order.seller?.phone ?? '—'}</p>
            <p className="mt-1 text-ink">
              {order.listings?.pickup_street}, {order.listings?.pickup_city}
            </p>
            <p className="text-ink-muted">
              קומה {order.listings?.pickup_floor}
              {order.listings?.pickup_has_elevator ? ' · מעלית' : ' · ללא מעלית'}
              {order.listings?.needs_disassembly ? ' · דורש פירוק' : ''}
            </p>
          </section>

          <section className="rounded-lg border border-line bg-surface p-4 text-body-sm">
            <h2 className="text-caption font-medium text-ink-muted">מסירה — קונה</h2>
            <p className="mt-2 text-ink">{order.buyer?.full_name}</p>
            <p className="text-ink-muted ltr-isolate">{order.buyer?.phone ?? '—'}</p>
            {order.delivery_method === 'self_pickup' ? (
              <p className="mt-1 text-ink">איסוף עצמי</p>
            ) : (
              <>
                <p className="mt-1 text-ink">
                  {order.dropoff_street}, {order.dropoff_city}
                </p>
                <p className="text-ink-muted">
                  קומה {order.dropoff_floor}
                  {order.dropoff_has_elevator ? ' · מעלית' : ' · ללא מעלית'}
                </p>
                {order.dropoff_notes ? (
                  <p className="mt-1 text-ink-muted">{order.dropoff_notes}</p>
                ) : null}
              </>
            )}
          </section>

          {delivery?.pickup_date ? (
            <section className="rounded-lg border border-line bg-surface p-4 text-body-sm">
              <h2 className="text-caption font-medium text-ink-muted">שיבוץ</h2>
              <p className="mt-2 text-ink">
                איסוף: {formatShortDate(`${delivery.pickup_date}T00:00:00`)}{' '}
                {delivery.pickup_shift ? SHIFT_LABELS[delivery.pickup_shift] : ''}
              </p>
              <p className="text-ink">
                מסירה: {formatShortDate(`${delivery.dropoff_date}T00:00:00`)}{' '}
                {delivery.dropoff_shift ? SHIFT_LABELS[delivery.dropoff_shift] : ''}
              </p>
              <p className="mt-1 text-ink-muted">
                {delivery.crew_name} · <span className="ltr-isolate">{delivery.crew_phone}</span>
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </Container>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`tabular ${strong ? 'font-medium text-ink' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}
