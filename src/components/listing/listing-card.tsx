import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/format';
import { coverPhoto, photoUrl } from '@/lib/storage';
import type { ListingCard as ListingCardData } from '@/lib/db/listings';
import { CONDITION_LABELS } from '@/lib/labels';

export function ListingCard({
  listing,
  priority = false,
}: {
  listing: ListingCardData;
  priority?: boolean;
}) {
  const cover = coverPhoto(listing.listing_photos);
  const isSold = listing.status === 'sold';
  const isReserved = listing.status === 'reserved';

  return (
    <Link href={`/item/${listing.slug}`} className="group block" data-testid="listing-card">
      <div className="relative overflow-hidden rounded-lg bg-sand">
        <div className="aspect-4/3 w-full">
          {cover ? (
            <Image
              src={photoUrl(cover.storage_path)}
              alt={cover.alt_text ?? listing.title}
              width={1200}
              height={900}
              priority={priority}
              // Without sizes, mobile downloads desktop-sized files.
              sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className={`size-full object-cover transition-transform duration-300 ease-brand group-hover:scale-[1.03] ${
                isSold ? 'opacity-60' : ''
              }`}
            />
          ) : (
            <div className="size-full bg-sand" aria-hidden />
          )}
        </div>

        {isSold ? (
          <Badge tone="ink" className="absolute top-3 start-3">
            נמכר
          </Badge>
        ) : isReserved ? (
          <Badge tone="clay" className="absolute top-3 start-3">
            בתהליך רכישה
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 space-y-1">
        <h3 className="line-clamp-2 text-h3 text-ink">{listing.title}</h3>
        <p className="font-display text-h3 text-clay tabular">{formatPrice(listing.price_agorot)}</p>
        <p className="text-body-sm text-ink-muted">
          {listing.pickup_city} · {CONDITION_LABELS[listing.condition]}
        </p>
      </div>
    </Link>
  );
}
