import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';
import { getOrderForUser } from '@/lib/db/orders';
import { getSiteConfig } from '@/lib/pricing/config';
import { formatPrice } from '@/lib/format';

export const metadata: Metadata = {
  title: 'התשלום התקבל',
  robots: { index: false, follow: false },
};

export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const user = await requireUser(`/checkout/${orderId}/success`);
  const order = await getOrderForUser(orderId);

  if (!order || order.buyer_id !== user.id) notFound();
  const config = await getSiteConfig();

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="font-display text-h1 text-ink" data-testid="checkout-success">
          התשלום התקבל
        </h1>

        {/* The auto-refund guarantee is stated up front. It is the direct
            answer to the failure that killed the pilot: 72% of buyers waited
            on a seller who never replied. [D-43], [LI 2] */}
        <p className="mt-4 text-body-lg text-ink-muted">
          שלחנו למוכר בקשת אישור. יש לו {config.seller_confirm_hours} שעות לאשר.
          אם לא יאשר — הכסף יוחזר לכם אוטומטית במלואו.
        </p>

        <dl className="mt-8 space-y-2 rounded-lg border border-line bg-surface p-5 text-start text-body-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">פריט</dt>
            <dd className="text-ink">{order.listings?.title}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">מספר הזמנה</dt>
            <dd className="text-ink ltr-isolate tabular">{order.id.slice(0, 8)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-medium">
            <dt className="text-ink">שולם</dt>
            <dd className="text-ink tabular">{formatPrice(order.total_agorot)}</dd>
          </div>
        </dl>

        <div className="mt-8">
          <Button asChild size="lg">
            <Link href="/dashboard/buyer">למעקב אחרי ההזמנה</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
