import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { createServiceSupabase } from '@/lib/supabase/service';
import { formatNumber, formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const service = createServiceSupabase();

  const [overview, sellerResponse, catalog, deliveryByZone, openDisputes, pendingPayouts] =
    await Promise.all([
      service.from('kpi_overview').select('*').maybeSingle(),
      service.from('kpi_seller_response').select('*').maybeSingle(),
      service.from('kpi_catalog').select('*').maybeSingle(),
      service.from('kpi_delivery_by_zone').select('*'),
      service.from('disputes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      service.from('payouts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

  const o = overview.data;
  const s = sellerResponse.data;
  const c = catalog.data;

  const deliveryCharged = (deliveryByZone.data ?? []).reduce(
    (sum, row) => sum + Number(row.charged_agorot ?? 0),
    0,
  );
  const deliveryCost = (deliveryByZone.data ?? []).reduce(
    (sum, row) => sum + Number(row.actual_cost_agorot ?? 0),
    0,
  );

  return (
    <Container className="py-8">
      <h1 className="font-display text-h1 text-ink">לוח בקרה</h1>

      <section className="mt-8">
        <h2 className="text-caption font-medium text-ink-muted">מסחר</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="מחזור (GMV)" value={formatPrice(Number(o?.gmv_agorot ?? 0))} />
          <Kpi label="עמלות" value={formatPrice(Number(o?.take_agorot ?? 0))} />
          <Kpi label="הזמנות שהושלמו" value={formatNumber(Number(o?.completed_orders ?? 0))} />
          <Kpi label="הזמנות פעילות" value={formatNumber(Number(o?.live_orders ?? 0))} />
        </div>
      </section>

      {/* Seller confirmation is the metric that killed the pilot — 72% of
          legacy orders died waiting here — so it gets its own row rather than
          being buried in a table. [D-43], [LI 2] */}
      <section className="mt-8">
        <h2 className="text-caption font-medium text-ink-muted">אישור מוכרים — המדד הקריטי</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="שיעור אישור"
            value={s?.confirm_rate_pct != null ? `${s.confirm_rate_pct}%` : '—'}
            testId="kpi-confirm-rate"
            emphasis
          />
          <Kpi
            label="זמן ממוצע לאישור"
            value={s?.avg_hours_to_confirm != null ? `${s.avg_hours_to_confirm} שעות` : '—'}
          />
          <Kpi label="בוטלו בטיימאאוט" value={formatNumber(Number(s?.timed_out ?? 0))} />
          <Kpi label="סה״כ בקשות" value={formatNumber(Number(s?.total_requests ?? 0))} />
        </div>
      </section>

      {/* The flat zone fees may sit below cost on a sofa-heavy catalogue, so
          the gap is surfaced by default rather than discovered later. [D-37] */}
      <section className="mt-8">
        <h2 className="text-caption font-medium text-ink-muted">הובלה — הכנסה מול עלות</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Kpi label="נגבה מקונים" value={formatPrice(deliveryCharged)} />
          <Kpi
            label="עלות צוותים בפועל"
            value={deliveryCost > 0 ? formatPrice(deliveryCost) : 'טרם הוזן'}
          />
          <Kpi
            label="מרווח"
            value={deliveryCost > 0 ? formatPrice(deliveryCharged - deliveryCost) : '—'}
            testId="kpi-delivery-margin"
            emphasis={deliveryCost > 0 && deliveryCharged - deliveryCost < 0}
          />
        </div>
        {deliveryCost === 0 ? (
          <p className="mt-2 text-body-sm text-ink-subtle">
            הזינו את עלות הצוות בכל הובלה כדי לראות את המרווח האמיתי.
          </p>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-caption font-medium text-ink-muted">דורש טיפול</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiLink
            label="ממתינים לאישור"
            value={formatNumber(Number(c?.pending_review ?? 0))}
            href="/admin/review"
            testId="kpi-pending-review"
          />
          <KpiLink
            label="בירורים פתוחים"
            value={formatNumber(openDisputes.count ?? 0)}
            href="/admin/disputes"
          />
          <KpiLink
            label="תשלומים ממתינים"
            value={formatNumber(pendingPayouts.count ?? 0)}
            href="/admin/payouts"
          />
          <Kpi label="פריטים פעילים" value={formatNumber(Number(c?.active_listings ?? 0))} />
        </div>
      </section>
    </Container>
  );
}

function Kpi({
  label,
  value,
  testId,
  emphasis,
}: {
  label: string;
  value: string;
  testId?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-caption text-ink-muted">{label}</p>
      <p
        className={`mt-1 font-display text-h2 tabular ${emphasis ? 'text-clay' : 'text-ink'}`}
        data-testid={testId}
      >
        {value}
      </p>
    </div>
  );
}

function KpiLink({
  label,
  value,
  href,
  testId,
}: {
  label: string;
  value: string;
  href: string;
  testId?: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-line bg-surface p-4 hover:bg-sand">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-h2 text-ink tabular" data-testid={testId}>
        {value}
      </p>
    </Link>
  );
}
