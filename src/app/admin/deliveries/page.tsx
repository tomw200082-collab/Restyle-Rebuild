import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { EmptyState } from '@/components/ui/empty-state';
import { ManifestCopy } from '@/components/admin/manifest-copy';
import { createServiceSupabase } from '@/lib/supabase/service';
import { formatShortDate } from '@/lib/format';
import { SHIFT_LABELS } from '@/lib/labels';
import { toDateKey } from '@/lib/scheduling';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הובלות' };

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const day = date ?? toDateKey(new Date());
  const service = createServiceSupabase();

  const { data: deliveries, error } = await service
    .from('deliveries')
    .select(
      `id, order_id, pickup_date, pickup_shift, dropoff_date, dropoff_shift,
       crew_name, crew_phone, status, admin_notes, actual_cost_agorot,
       orders!deliveries_order_id_fkey (
         id, dropoff_city, dropoff_street, dropoff_floor, dropoff_has_elevator, dropoff_notes,
         listings!orders_listing_id_fkey ( title, pickup_city, pickup_street, pickup_floor,
                                           pickup_has_elevator, needs_disassembly ),
         buyer:profiles!orders_buyer_profile_fk ( full_name, phone ),
         seller:profiles!orders_seller_profile_fk ( full_name, phone )
       )`,
    )
    .or(`pickup_date.eq.${day},dropoff_date.eq.${day}`)
    .order('pickup_shift');
  if (error) throw error;

  const rows = deliveries ?? [];

  /**
   * The manifest is a plain text block the crew can be sent on WhatsApp.
   * WhatsApp integration itself is out of scope, so the deliverable is text a
   * human copies — which is what the ops flow actually needs today. [MP 10]
   *
   * Each stop names its crew because the day view spans every crew working
   * that date; a crew receiving one pasted block has to be able to tell which
   * stops are theirs.
   */
  const manifest = [
    `מניפסט Restyle — ${formatShortDate(`${day}T00:00:00`)}`,
    '',
    ...rows.flatMap((d) => {
      const order = d.orders;
      const listing = order?.listings;
      const lines: string[] = [];

      if (d.pickup_date === day) {
        lines.push(
          `איסוף (${d.pickup_shift ? SHIFT_LABELS[d.pickup_shift] : ''}) — ${d.crew_name ?? 'ללא צוות'}`,
          `  ${listing?.title ?? ''}`,
          `  ${listing?.pickup_street ?? ''}, ${listing?.pickup_city ?? ''}` +
            `  קומה ${listing?.pickup_floor ?? 0}${listing?.pickup_has_elevator ? ' (מעלית)' : ' (ללא מעלית)'}`,
          `  ${order?.seller?.full_name ?? ''} ${order?.seller?.phone ?? ''}`,
          listing?.needs_disassembly ? '  ⚠ דורש פירוק' : '',
          '',
        );
      }

      if (d.dropoff_date === day) {
        lines.push(
          `מסירה (${d.dropoff_shift ? SHIFT_LABELS[d.dropoff_shift] : ''}) — ${d.crew_name ?? 'ללא צוות'}`,
          `  ${listing?.title ?? ''}`,
          `  ${order?.dropoff_street ?? ''}, ${order?.dropoff_city ?? ''}` +
            `  קומה ${order?.dropoff_floor ?? 0}${order?.dropoff_has_elevator ? ' (מעלית)' : ' (ללא מעלית)'}`,
          `  ${order?.buyer?.full_name ?? ''} ${order?.buyer?.phone ?? ''}`,
          order?.dropoff_notes ? `  הערה: ${order.dropoff_notes}` : '',
          '',
        );
      }

      return lines.filter(Boolean);
    }),
  ].join('\n');

  const shiftDate = (offset: number) => {
    const d = new Date(`${day}T00:00:00`);
    d.setDate(d.getDate() + offset);
    return toDateKey(d);
  };

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-h1 text-ink">
          הובלות — {formatShortDate(`${day}T00:00:00`)}
        </h1>
        <div className="flex items-center gap-2 text-body-sm">
          <Link href={`/admin/deliveries?date=${shiftDate(-1)}`} className="text-clay hover:underline">
            יום קודם
          </Link>
          <span className="text-ink-subtle">·</span>
          <Link href="/admin/deliveries" className="text-clay hover:underline">
            היום
          </Link>
          <span className="text-ink-subtle">·</span>
          <Link href={`/admin/deliveries?date=${shiftDate(1)}`} className="text-clay hover:underline">
            יום הבא
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="אין הובלות ביום הזה" body="הזמנות שאושרו ממתינות לשיבוץ בעמוד ההזמנות." />
      ) : (
        <>
          <div className="mt-6">
            <ManifestCopy manifest={manifest} />
          </div>

          <ul className="mt-6 space-y-3">
            {rows.map((d) => (
              <li
                key={d.id}
                className="rounded-lg border border-line bg-surface p-4 text-body-sm"
                data-testid="delivery-row"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/orders/${d.order_id}`} className="text-body text-ink hover:underline">
                    {d.orders?.listings?.title}
                  </Link>
                  <span className="text-ink-muted">
                    {d.crew_name} · <span className="ltr-isolate">{d.crew_phone}</span>
                  </span>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <p className="text-ink-muted">
                    איסוף {d.pickup_shift ? SHIFT_LABELS[d.pickup_shift] : ''} —{' '}
                    {d.orders?.listings?.pickup_street}, {d.orders?.listings?.pickup_city}
                  </p>
                  <p className="text-ink-muted">
                    מסירה {d.dropoff_shift ? SHIFT_LABELS[d.dropoff_shift] : ''} —{' '}
                    {d.orders?.dropoff_street}, {d.orders?.dropoff_city}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}
