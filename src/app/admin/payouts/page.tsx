import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MarkPaidButton } from '@/components/admin/mark-paid-button';
import { createServiceSupabase } from '@/lib/supabase/service';
import { formatPrice, formatShortDate } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'תשלומים' };

export default async function PayoutsPage() {
  const service = createServiceSupabase();
  const { data: payouts, error } = await service
    .from('payouts')
    .select(
      `id, amount_agorot, status, paid_at, method_note, created_at, order_id,
       profiles!payouts_seller_profile_fk ( full_name, email, phone )`,
    )
    .order('status')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = payouts ?? [];
  const pending = rows.filter((p) => p.status === 'pending');
  const pendingTotal = pending.reduce((sum, p) => sum + p.amount_agorot, 0);

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1 text-ink">תשלומים למוכרים</h1>
        <p className="text-body-sm text-ink-muted">
          ממתינים: <span className="tabular text-ink">{formatPrice(pendingTotal)}</span> ב-
          {pending.length} תשלומים
        </p>
      </div>

      <p className="mt-2 text-body-sm text-ink-subtle">
        התשלומים מבוצעים בהעברה בנקאית ידנית. סימון כשולם מעדכן את המוכר ונרשם ביומן ההזמנה.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="אין עדיין תשלומים"
          body="תשלום נוצר אוטומטית כשחלון הבדיקה של הקונה עובר ללא בקשת בירור."
        />
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map((payout) => (
            <li
              key={payout.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4"
              data-testid="admin-payout-row"
              data-status={payout.status}
              data-order-id={payout.order_id}
            >
              <div>
                <p className="text-body text-ink">
                  {payout.profiles?.full_name ?? '—'}{' '}
                  <span className="text-body-sm text-ink-muted ltr-isolate">
                    {payout.profiles?.email}
                  </span>
                </p>
                <p className="text-body-sm text-ink-muted">
                  <Link href={`/admin/orders/${payout.order_id}`} className="hover:underline">
                    הזמנה {payout.order_id.slice(0, 8)}
                  </Link>
                  {' · '}
                  {payout.paid_at
                    ? `שולם ${formatShortDate(payout.paid_at)}${payout.method_note ? ` · ${payout.method_note}` : ''}`
                    : `נוצר ${formatShortDate(payout.created_at)}`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-display text-h3 text-ink tabular">
                  {formatPrice(payout.amount_agorot)}
                </span>
                {payout.status === 'paid' ? (
                  <Badge tone="success">שולם</Badge>
                ) : (
                  <MarkPaidButton payoutId={payout.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
