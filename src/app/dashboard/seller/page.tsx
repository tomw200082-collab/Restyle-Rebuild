import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardTabs } from '@/components/dashboard/tabs';
import { OrderRow } from '@/components/dashboard/order-row';
import { OfferList } from '@/components/dashboard/offer-list';
import { requireUser } from '@/lib/auth/session';
import { listOrdersForSeller } from '@/lib/db/orders';
import { createServerSupabase } from '@/lib/supabase/server';
import { formatPrice, formatShortDate } from '@/lib/format';
import { LISTING_STATUS_LABELS } from '@/lib/labels';
import { coverPhoto, photoUrl } from '@/lib/storage';
import type { Enums } from '@/types/database';

export const metadata: Metadata = {
  title: 'המכירות שלי',
  robots: { index: false, follow: false },
};

const LISTING_TONE: Record<
  Enums<'listing_status'>,
  'neutral' | 'success' | 'warning' | 'danger' | 'clay' | 'ink'
> = {
  draft: 'neutral',
  pending_review: 'warning',
  active: 'success',
  reserved: 'clay',
  sold: 'ink',
  rejected: 'danger',
  expired: 'neutral',
  paused: 'warning',
  removed: 'neutral',
};

export default async function SellerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = 'listings' } = await searchParams;
  const user = await requireUser('/dashboard/seller');
  const supabase = await createServerSupabase();

  const [listingsResult, orders, offersResult, payoutsResult] = await Promise.all([
    supabase
      .from('listings')
      .select(
        `id, slug, title, price_agorot, status, rejection_reason, created_at, expires_at,
         listing_photos ( storage_path, alt_text, sort )`,
      )
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false }),
    listOrdersForSeller(user.id),
    supabase
      .from('offers')
      .select(
        `id, amount_agorot, counter_amount_agorot, status, expires_at, checkout_expires_at, created_at,
         listings!inner ( id, slug, title, price_agorot, seller_id )`,
      )
      .eq('listings.seller_id', user.id)
      .in('status', ['pending', 'countered', 'accepted'])
      .order('created_at', { ascending: false }),
    supabase
      .from('payouts')
      .select('id, amount_agorot, status, paid_at, created_at, order_id')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const listings = listingsResult.data ?? [];
  const offers = offersResult.data ?? [];
  const payouts = payoutsResult.data ?? [];
  const awaitingConfirmation = orders.filter((o) => o.status === 'pending_seller_confirmation');

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-h1 text-ink">המכירות שלי</h1>
        <Button asChild>
          <Link href="/sell/new">פרסום פריט</Link>
        </Button>
      </div>

      {/* The single most time-sensitive thing a seller can be shown. 72% of
          legacy orders died waiting here. [D-43] */}
      {awaitingConfirmation.length > 0 ? (
        <div className="mt-6 rounded-lg border border-clay bg-clay-soft p-4" data-testid="awaiting-banner">
          <p className="text-body font-medium text-clay-hover">
            {awaitingConfirmation.length === 1
              ? 'יש קונה ששילם וממתין לאישור שלך'
              : `${awaitingConfirmation.length} קונים שילמו וממתינים לאישור שלך`}
          </p>
          <p className="mt-1 text-body-sm text-ink-muted">
            אם לא תאשרו בזמן, ההזמנה תבוטל והכסף יוחזר לקונה.
          </p>
          <div className="mt-3">
            <Button asChild size="sm">
              <Link href={`/dashboard/seller/orders/${awaitingConfirmation[0]!.id}`}>
                לאישור המכירה
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <DashboardTabs
          basePath="/dashboard/seller"
          active={tab}
          tabs={[
            { key: 'listings', label: 'הפריטים שלי', count: listings.length },
            { key: 'sales', label: 'מכירות', count: orders.length },
            { key: 'offers', label: 'הצעות', count: offers.length },
            { key: 'payouts', label: 'תשלומים', count: payouts.length },
          ]}
        />
      </div>

      <div className="mt-8">
        {tab === 'listings' ? (
          listings.length === 0 ? (
            <EmptyState
              title="עדיין לא פרסמתם פריט"
              body="הפרסום חינם, והעמלה נגבית רק כשהפריט נמכר."
              action={
                <Button asChild>
                  <Link href="/sell/new">פרסום פריט</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {listings.map((listing) => {
                const cover = coverPhoto(listing.listing_photos);
                return (
                  <li
                    key={listing.id}
                    className="rounded-lg border border-line bg-surface p-4"
                    data-testid="seller-listing"
                    data-status={listing.status}
                  >
                    <div className="flex gap-4">
                      {cover ? (
                        <Image
                          src={photoUrl(cover.storage_path)}
                          alt=""
                          width={160}
                          height={120}
                          sizes="80px"
                          className="aspect-4/3 w-20 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="aspect-4/3 w-20 shrink-0 rounded-md bg-sand" aria-hidden />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body text-ink">{listing.title}</p>
                        <p className="mt-1 text-body-sm text-ink-muted tabular">
                          {formatPrice(listing.price_agorot)}
                        </p>
                        {listing.status === 'rejected' && listing.rejection_reason ? (
                          <p className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-body-sm text-danger">
                            {listing.rejection_reason}
                          </p>
                        ) : null}
                      </div>

                      <Badge tone={LISTING_TONE[listing.status]} className="self-start whitespace-nowrap">
                        {LISTING_STATUS_LABELS[listing.status]}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        {tab === 'sales' ? (
          orders.length === 0 ? (
            <EmptyState title="אין עדיין מכירות" body="כשקונה ירכוש פריט שלכם, ההזמנה תופיע כאן." />
          ) : (
            <ul className="space-y-3">
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} href={`/dashboard/seller/orders/${order.id}`} />
              ))}
            </ul>
          )
        ) : null}

        {tab === 'offers' ? (
          offers.length === 0 ? (
            <EmptyState title="אין הצעות פתוחות" body="הצעות מחיר על הפריטים שלכם יופיעו כאן." />
          ) : (
            <OfferList offers={offers} role="seller" />
          )
        ) : null}

        {tab === 'payouts' ? (
          payouts.length === 0 ? (
            <EmptyState
              title="אין עדיין תשלומים"
              body="התשלום משוחרר אחרי שהקונה מקבל את הפריט וחלון הבדיקה עובר."
            />
          ) : (
            <ul className="space-y-3">
              {payouts.map((payout) => (
                <li
                  key={payout.id}
                  className="flex items-center justify-between rounded-lg border border-line bg-surface p-4"
                  data-testid="payout-row"
                  data-status={payout.status}
                >
                  <div>
                    <p className="text-body text-ink tabular">{formatPrice(payout.amount_agorot)}</p>
                    <p className="text-body-sm text-ink-muted">
                      {payout.paid_at
                        ? `שולם ב-${formatShortDate(payout.paid_at)}`
                        : `נוצר ב-${formatShortDate(payout.created_at)}`}
                    </p>
                  </div>
                  <Badge tone={payout.status === 'paid' ? 'success' : 'warning'}>
                    {payout.status === 'paid' ? 'שולם' : 'ממתין'}
                  </Badge>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </Container>
  );
}
