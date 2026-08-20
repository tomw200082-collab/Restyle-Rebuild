import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardTabs } from '@/components/dashboard/tabs';
import { OrderRow } from '@/components/dashboard/order-row';
import { ListingCard } from '@/components/listing/listing-card';
import { OfferList } from '@/components/dashboard/offer-list';
import { requireUser } from '@/lib/auth/session';
import { listOrdersForBuyer } from '@/lib/db/orders';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ListingCard as ListingCardData } from '@/lib/db/listings';

export const metadata: Metadata = {
  title: 'הרכישות שלי',
  robots: { index: false, follow: false },
};

export default async function BuyerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = 'orders' } = await searchParams;
  const user = await requireUser('/dashboard/buyer');
  const supabase = await createServerSupabase();

  const [orders, offersResult, favoritesResult] = await Promise.all([
    listOrdersForBuyer(user.id),
    supabase
      .from('offers')
      .select(
        `id, amount_agorot, counter_amount_agorot, status, expires_at, checkout_expires_at, created_at,
         listings ( id, slug, title, price_agorot )`,
      )
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('favorites')
      .select(
        `listing_id,
         listings ( id, slug, title, price_agorot, original_price_agorot, condition,
                    pickup_city, status, published_at,
                    categories ( slug, name_he ), brands ( slug, name ),
                    listing_photos ( storage_path, alt_text, sort ) )`,
      )
      .eq('user_id', user.id),
  ]);

  const offers = offersResult.data ?? [];
  const favorites = (favoritesResult.data ?? [])
    .map((f) => f.listings)
    .filter(Boolean) as unknown as ListingCardData[];

  return (
    <Container className="py-10">
      <h1 className="font-display text-h1 text-ink">הרכישות שלי</h1>

      <div className="mt-8">
        <DashboardTabs
          basePath="/dashboard/buyer"
          active={tab}
          tabs={[
            { key: 'orders', label: 'הזמנות', count: orders.length },
            { key: 'offers', label: 'ההצעות שלי', count: offers.length },
            { key: 'favorites', label: 'מועדפים', count: favorites.length },
          ]}
        />
      </div>

      <div className="mt-8">
        {tab === 'orders' ? (
          orders.length === 0 ? (
            <EmptyState
              title="עדיין לא רכשתם כלום"
              body="כשתרכשו פריט, תוכלו לעקוב כאן אחרי ההזמנה מהאישור ועד המסירה."
              action={
                <Button asChild>
                  <Link href="/catalog">לקטלוג</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  href={`/dashboard/buyer/orders/${order.id}`}
                />
              ))}
            </ul>
          )
        ) : null}

        {tab === 'offers' ? (
          offers.length === 0 ? (
            <EmptyState
              title="לא הגשתם הצעות"
              body="אפשר להגיש הצעת מחיר על כל פריט פעיל בקטלוג."
              action={
                <Button asChild>
                  <Link href="/catalog">לקטלוג</Link>
                </Button>
              }
            />
          ) : (
            <OfferList offers={offers} role="buyer" />
          )
        ) : null}

        {tab === 'favorites' ? (
          favorites.length === 0 ? (
            <EmptyState
              title="אין פריטים במועדפים"
              body="לחצו על הלב בעמוד פריט כדי לשמור אותו לכאן."
              action={
                <Button asChild>
                  <Link href="/catalog">לקטלוג</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
              {favorites.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )
        ) : null}
      </div>
    </Container>
  );
}
