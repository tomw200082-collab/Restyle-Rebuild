import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { UnpauseSellerButton } from '@/components/admin/unpause-seller-button';
import { createServiceSupabase } from '@/lib/supabase/service';
import { formatPrice, formatShortDate } from '@/lib/format';
import { LISTING_STATUS_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'פריטים' };

const TONE: Record<Enums<'listing_status'>, 'neutral' | 'success' | 'warning' | 'danger' | 'clay' | 'ink'> = {
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

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const service = createServiceSupabase();

  let query = service
    .from('listings')
    .select(
      `id, slug, title, price_agorot, status, pickup_city, created_at, view_count, seller_id,
       profiles!listings_seller_profile_fk ( full_name )`,
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) query = query.eq('status', status as Enums<'listing_status'>);

  const { data: listings, error } = await query;
  if (error) throw error;
  const rows = listings ?? [];

  const STATUSES: Array<Enums<'listing_status'> | ''> = [
    '', 'pending_review', 'active', 'paused', 'reserved', 'sold', 'rejected', 'expired', 'draft',
  ];

  return (
    <Container className="py-8">
      <h1 className="font-display text-h1 text-ink">פריטים</h1>

      <nav aria-label="סינון לפי סטטוס" className="mt-6 flex flex-wrap gap-2">
        {STATUSES.map((value) => (
          <Link
            key={value || 'all'}
            href={value ? `/admin/listings?status=${value}` : '/admin/listings'}
            className={`rounded-sm px-3 py-1 text-body-sm ${
              (status ?? '') === value ? 'bg-clay text-white' : 'bg-sand text-ink-muted hover:text-ink'
            }`}
          >
            {value ? LISTING_STATUS_LABELS[value] : 'הכל'}
          </Link>
        ))}
      </nav>

      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-body-sm">
          <thead className="border-b border-line text-caption text-ink-muted">
            <tr>
              <th className="p-3 text-start font-medium">פריט</th>
              <th className="p-3 text-start font-medium">מוכר</th>
              <th className="p-3 text-start font-medium">עיר</th>
              <th className="p-3 text-end font-medium">מחיר</th>
              <th className="p-3 text-start font-medium">סטטוס</th>
              <th className="p-3 text-start font-medium">נוצר</th>
              <th className="p-3 text-start font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((listing) => (
              <tr key={listing.id} data-testid="admin-listing-row">
                <td className="max-w-64 truncate p-3">
                  <Link href={`/item/${listing.slug}`} className="text-ink hover:underline">
                    {listing.title}
                  </Link>
                </td>
                <td className="p-3 text-ink-muted">{listing.profiles?.full_name ?? '—'}</td>
                <td className="p-3 text-ink-muted">{listing.pickup_city}</td>
                {/* Numeric column: end-aligned with tabular figures so the
                    prices line up regardless of digit widths. */}
                <td className="p-3 text-end text-ink tabular">{formatPrice(listing.price_agorot)}</td>
                <td className="p-3">
                  <Badge tone={TONE[listing.status]}>{LISTING_STATUS_LABELS[listing.status]}</Badge>
                </td>
                <td className="p-3 text-ink-muted">{formatShortDate(listing.created_at)}</td>
                <td className="p-3">
                  {/* The pause was applied to the seller, so the undo is too.
                      Shown only on a paused row, because that is the only place
                      an operator is looking when they want it. [D-74] */}
                  {listing.status === 'paused' ? (
                    <UnpauseSellerButton
                      sellerId={listing.seller_id}
                      sellerName={listing.profiles?.full_name ?? null}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
