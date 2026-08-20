import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';
import { getOrderForUser } from '@/lib/db/orders';

export const metadata: Metadata = {
  title: 'התשלום לא הושלם',
  robots: { index: false, follow: false },
};

export default async function CheckoutCancelledPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const user = await requireUser(`/checkout/${orderId}/cancelled`);
  const order = await getOrderForUser(orderId);

  if (!order || order.buyer_id !== user.id) notFound();

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="font-display text-h1 text-ink" data-testid="checkout-cancelled">
          התשלום לא הושלם
        </h1>
        <p className="mt-4 text-body-lg text-ink-muted">
          לא חויבתם. הפריט חזר להיות זמין לרכישה.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {order.listings?.slug ? (
            <Button asChild size="lg">
              <Link href={`/item/${order.listings.slug}`}>חזרה לפריט</Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary" size="lg">
            <Link href="/catalog">לקטלוג</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
