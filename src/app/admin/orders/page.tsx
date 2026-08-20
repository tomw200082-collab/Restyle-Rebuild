import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { createServiceSupabase } from '@/lib/supabase/service';
import { formatPrice, formatShortDate, hoursUntil } from '@/lib/format';
import { ORDER_STATUS_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הזמנות' };

/** Ordered by where the work is, not by the enum's declaration order. */
const COLUMNS: Enums<'order_status'>[] = [
  'pending_seller_confirmation',
  'confirmed',
  'delivery_scheduled',
  'picked_up',
  'delivered',
  'disputed',
  'completed',
];

export default async function AdminOrdersPage() {
  const service = createServiceSupabase();
  const { data: orders, error } = await service
    .from('orders')
    .select(
      `id, status, total_agorot, created_at, confirmed_at, protection_expires_at, paid_at,
       listings!orders_listing_id_fkey ( title, pickup_city ),
       profiles!orders_buyer_profile_fk ( full_name )`,
    )
    .in('status', COLUMNS)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const byStatus = new Map<Enums<'order_status'>, typeof orders>();
  for (const status of COLUMNS) byStatus.set(status, []);
  for (const order of orders ?? []) byStatus.get(order.status)?.push(order);

  return (
    <Container className="py-8">
      <h1 className="font-display text-h1 text-ink">הזמנות</h1>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((status) => {
          const column = byStatus.get(status) ?? [];
          return (
            <section key={status} data-testid="order-column" data-status={status}>
              <h2 className="flex items-baseline justify-between text-caption font-medium text-ink-muted">
                {ORDER_STATUS_LABELS[status]}
                <span className="tabular">{column.length}</span>
              </h2>

              <ul className="mt-2 space-y-2">
                {column.map((order) => {
                  // Time pressure is the signal an ops person needs at a
                  // glance: which of these is about to auto-cancel.
                  const deadline =
                    order.status === 'pending_seller_confirmation'
                      ? hoursUntil(new Date(new Date(order.created_at).getTime() + 48 * 3_600_000))
                      : order.status === 'delivered' && order.protection_expires_at
                        ? hoursUntil(order.protection_expires_at)
                        : null;

                  return (
                    <li key={order.id}>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="block rounded-md border border-line bg-surface p-3 text-body-sm hover:bg-sand"
                        data-testid="admin-order-card"
                      >
                        <p className="truncate text-ink">{order.listings?.title}</p>
                        <p className="mt-1 text-ink-muted">
                          {order.profiles?.full_name ?? '—'} · {order.listings?.pickup_city}
                        </p>
                        <p className="mt-1 flex items-baseline justify-between text-ink-subtle">
                          <span className="tabular">{formatPrice(order.total_agorot)}</span>
                          <span>{formatShortDate(order.created_at)}</span>
                        </p>
                        {deadline !== null ? (
                          <Badge tone={deadline <= 12 ? 'danger' : 'warning'} className="mt-2">
                            {deadline} שעות
                          </Badge>
                        ) : null}
                        {!order.paid_at ? (
                          <Badge tone="neutral" className="mt-2">לא שולם</Badge>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Container>
  );
}
