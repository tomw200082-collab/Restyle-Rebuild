import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ResolveDispute } from '@/components/admin/resolve-dispute';
import { createServiceSupabase } from '@/lib/supabase/service';
import { formatPrice, formatShortDate } from '@/lib/format';
import { photoUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'בירורים' };

const REASON_LABELS: Record<string, string> = {
  not_as_described: 'אי־התאמה לתיאור',
  damaged: 'הגיע פגום',
  wrong_item: 'פריט שגוי',
  missing_parts: 'חלקים חסרים',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'פתוח',
  resolved_refund: 'הוחזר במלואו',
  resolved_partial: 'הוחזר חלקית',
  rejected: 'נדחה',
};

export default async function DisputesPage() {
  const service = createServiceSupabase();
  const { data: disputes, error } = await service
    .from('disputes')
    .select(
      `id, order_id, reason, description, photo_paths, status, resolution_note,
       refund_agorot, created_at, resolved_at,
       orders!disputes_order_id_fkey (
         id, total_agorot, seller_payout_agorot,
         listings!orders_listing_id_fkey ( title ),
         buyer:profiles!orders_buyer_profile_fk ( full_name, email )
       )`,
    )
    .order('status')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = disputes ?? [];

  return (
    <Container className="py-8">
      <h1 className="font-display text-h1 text-ink">בירורים</h1>
      <p className="mt-2 text-body-sm text-ink-subtle">
        התשלום למוכר מוקפא עד סיום הבדיקה. החלטה כאן היא סופית ומשנה כסף — היא נרשמת ביומן ההזמנה.
      </p>

      {rows.length === 0 ? (
        <EmptyState title="אין בירורים" body="בקשת בירור נפתחת על ידי קונה בתוך חלון הבדיקה." />
      ) : (
        <ul className="mt-8 space-y-4">
          {rows.map((dispute) => (
            <li
              key={dispute.id}
              className="rounded-lg border border-line bg-surface p-5"
              data-testid="dispute-card"
              data-status={dispute.status}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/admin/orders/${dispute.order_id}`}
                  className="text-body text-ink hover:underline"
                >
                  {dispute.orders?.listings?.title}
                </Link>
                <Badge tone={dispute.status === 'open' ? 'danger' : 'neutral'}>
                  {STATUS_LABELS[dispute.status] ?? dispute.status}
                </Badge>
              </div>

              <p className="mt-1 text-body-sm text-ink-muted">
                {REASON_LABELS[dispute.reason] ?? dispute.reason} ·{' '}
                {dispute.orders?.buyer?.full_name} · {formatShortDate(dispute.created_at)} ·{' '}
                <span className="tabular">{formatPrice(dispute.orders?.total_agorot ?? 0)}</span>
              </p>

              <p className="mt-3 whitespace-pre-line text-body-sm text-ink">{dispute.description}</p>

              {dispute.photo_paths.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {dispute.photo_paths.map((path) => (
                    <li key={path}>
                      <a href={photoUrl(path)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoUrl(path)}
                          alt=""
                          className="size-20 rounded-md object-cover"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              {dispute.status === 'open' ? (
                <div className="mt-4">
                  <ResolveDispute
                    disputeId={dispute.id}
                    totalAgorot={dispute.orders?.total_agorot ?? 0}
                  />
                </div>
              ) : (
                <p className="mt-3 rounded-md bg-sand px-3 py-2 text-body-sm text-ink-muted">
                  {dispute.resolution_note}
                  {dispute.refund_agorot > 0
                    ? ` · הוחזר ${formatPrice(dispute.refund_agorot)}`
                    : ''}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
