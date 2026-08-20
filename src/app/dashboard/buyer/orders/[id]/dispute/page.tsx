import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { DisputeForm } from '@/components/dashboard/dispute-form';
import { requireUser } from '@/lib/auth/session';
import { getOrderForUser } from '@/lib/db/orders';
import { hoursUntil } from '@/lib/format';

export const metadata: Metadata = {
  title: 'פתיחת בקשת בירור',
  robots: { index: false, follow: false },
};

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/buyer/orders/${id}/dispute`);
  const order = await getOrderForUser(id);

  if (!order || order.buyer_id !== user.id) notFound();

  // A dispute is a claim that the delivered item is not as described, so it is
  // meaningless before delivery and after the window closes. [D-13]
  if (order.status !== 'delivered') redirect(`/dashboard/buyer/orders/${id}`);

  return (
    <Container className="py-10">
      <div className="mx-auto max-w-lg">
        <h1 className="font-display text-h1 text-ink">פתיחת בקשת בירור</h1>
        <p className="mt-2 text-body text-ink-muted">{order.listings?.title}</p>
        {order.protection_expires_at ? (
          <p className="mt-1 text-body-sm text-ink-subtle">
            נותרו {hoursUntil(order.protection_expires_at)} שעות לפתיחת בקשה.
          </p>
        ) : null}

        <DisputeForm orderId={order.id} userId={user.id} />
      </div>
    </Container>
  );
}
