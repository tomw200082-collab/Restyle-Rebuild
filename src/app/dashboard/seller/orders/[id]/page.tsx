import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { ConfirmSale } from '@/components/dashboard/confirm-sale';
import { OrderTimeline } from '@/components/dashboard/order-timeline';
import { requireUser } from '@/lib/auth/session';
import { getOrderForUser, listOrderEvents } from '@/lib/db/orders';
import { getSiteConfig } from '@/lib/pricing/config';
import { formatPrice, hoursUntil } from '@/lib/format';
import { ORDER_STATUS_LABELS } from '@/lib/labels';

export const metadata: Metadata = {
  title: 'פרטי מכירה',
  robots: { index: false, follow: false },
};

export default async function SellerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/seller/orders/${id}`);

  const [order, events, config] = await Promise.all([
    getOrderForUser(id),
    listOrderEvents(id),
    getSiteConfig(),
  ]);

  if (!order || order.seller_id !== user.id) notFound();

  const deadline = new Date(
    new Date(order.created_at).getTime() + config.seller_confirm_hours * 3_600_000,
  );
  const needsConfirmation = order.status === 'pending_seller_confirmation' && Boolean(order.paid_at);

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-h1 text-ink">{order.listings?.title}</h1>
        <Badge tone="clay">{ORDER_STATUS_LABELS[order.status]}</Badge>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {needsConfirmation ? (
            <ConfirmSale orderId={order.id} hoursLeft={hoursUntil(deadline)} />
          ) : null}

          <OrderTimeline events={events} />
        </div>

        <aside className="lg:col-span-5">
          <dl className="space-y-2 rounded-lg border border-line bg-surface p-5 text-body-sm">
            <Row label="מחיר הפריט" value={formatPrice(order.item_agorot)} />
            <Row label="עמלת Restyle" value={`−${formatPrice(order.commission_agorot)}`} />
            <div className="flex items-baseline justify-between border-t border-line pt-2 text-body font-medium">
              <dt className="text-ink">התשלום שלכם</dt>
              <dd className="text-clay tabular" data-testid="seller-payout">
                {formatPrice(order.seller_payout_agorot)}
              </dd>
            </div>
            <p className="pt-2 text-caption text-ink-subtle">
              התשלום משוחרר {config.protection_hours} שעות אחרי המסירה, אם לא נפתחה בקשת בירור.
            </p>
          </dl>
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
