import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { MockPayButtons } from '@/components/pay/mock-pay-buttons';
import { requireUser } from '@/lib/auth/session';
import { createServerSupabase } from '@/lib/supabase/server';
import { getPaymentProvider, MockPaymentProvider } from '@/lib/payments';
import { formatPrice } from '@/lib/format';

export const metadata: Metadata = {
  title: 'תשלום (סביבת בדיקה)',
  robots: { index: false, follow: false },
};

/**
 * Stand-in for a hosted payment page. It exists so the whole purchase
 * lifecycle is exercisable without credentials — and it goes through the real
 * webhook with a real signature, so the verification branch is genuinely
 * covered rather than bypassed. [D-27]
 */
export default async function MockPayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const user = await requireUser(`/pay/mock/${orderId}`);

  const provider = getPaymentProvider();
  if (!(provider instanceof MockPaymentProvider)) notFound();

  const supabase = await createServerSupabase();
  const { data: order } = await supabase
    .from('orders')
    .select('id, total_agorot, buyer_id, status, paid_at, listings!orders_listing_id_fkey ( title, slug )')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.buyer_id !== user.id) notFound();

  // Signed here because the secret is server-only. The browser posts an opaque
  // signed payload exactly as a PSP callback would.
  const sign = (outcome: 'captured' | 'cancelled') => {
    const payload = JSON.stringify({
      orderId: order.id,
      outcome,
      amount_agorot: order.total_agorot,
    });
    return { payload, signature: provider.sign(payload) };
  };

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-md rounded-lg border border-line bg-surface p-6">
        <p className="text-caption text-warning">סביבת בדיקה — לא מתבצע חיוב אמיתי</p>
        <h1 className="mt-2 font-display text-h2 text-ink">תשלום</h1>

        <dl className="mt-6 space-y-2 border-y border-line py-4 text-body-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">פריט</dt>
            <dd className="text-ink">{order.listings?.title}</dd>
          </div>
          <div className="flex justify-between text-body font-medium">
            <dt className="text-ink">לתשלום</dt>
            <dd className="text-ink tabular">{formatPrice(order.total_agorot)}</dd>
          </div>
        </dl>

        <MockPayButtons
          orderId={order.id}
          success={sign('captured')}
          cancel={sign('cancelled')}
        />
      </div>
    </Container>
  );
}
