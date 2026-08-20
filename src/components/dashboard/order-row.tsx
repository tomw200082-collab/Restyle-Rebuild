import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatPrice, formatShortDate } from '@/lib/format';
import { ORDER_STATUS_LABELS } from '@/lib/labels';
import { coverPhoto, photoUrl } from '@/lib/storage';
import type { Enums } from '@/types/database';

const TONE: Record<Enums<'order_status'>, 'neutral' | 'success' | 'warning' | 'danger' | 'clay'> = {
  pending_seller_confirmation: 'warning',
  confirmed: 'clay',
  delivery_scheduled: 'clay',
  picked_up: 'clay',
  delivered: 'success',
  completed: 'success',
  cancelled: 'danger',
  disputed: 'danger',
  refunded: 'neutral',
};

export type OrderRowData = {
  id: string;
  status: Enums<'order_status'>;
  total_agorot: number;
  created_at: string;
  listings: {
    title: string;
    slug: string;
    listing_photos: Array<{ storage_path: string; alt_text: string | null; sort: number }>;
  } | null;
};

export function OrderRow({ order, href }: { order: OrderRowData; href: string }) {
  const cover = coverPhoto(order.listings?.listing_photos);

  return (
    <li>
      <Link
        href={href}
        className="flex gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:bg-sand"
        data-testid="order-row"
        data-status={order.status}
      >
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
          <p className="truncate text-body text-ink">{order.listings?.title ?? 'פריט'}</p>
          <p className="mt-1 text-body-sm text-ink-muted">
            {formatShortDate(order.created_at)} · <span className="tabular">{formatPrice(order.total_agorot)}</span>
          </p>
        </div>

        <Badge tone={TONE[order.status]} className="self-start whitespace-nowrap">
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </Link>
    </li>
  );
}
