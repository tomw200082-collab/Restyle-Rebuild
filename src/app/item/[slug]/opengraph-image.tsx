import { ImageResponse } from 'next/og';
import { getListingBySlug } from '@/lib/db/listings';
import { photoUrl } from '@/lib/storage';
import { CONDITION_LABELS } from '@/lib/labels';
import { formatPrice } from '@/lib/format';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'פריט למכירה ב-Restyle';

/**
 * The share card is the photo, the title and the price — in that order of
 * visual weight, because this is a photography-first product and a card that
 * leads with text looks like a classified ad.
 *
 * Rendered with the platform's own font stack rather than a fetched Hebrew
 * webfont: satori has no network access here, and a missing font renders as
 * tofu, which is worse than a system serif.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FAF7F2',
            color: '#22201D',
            fontSize: 64,
          }}
        >
          Restyle
        </div>
      ),
      size,
    );
  }

  const cover = [...(listing.listing_photos ?? [])].sort((a, b) => a.sort - b.sort)[0];
  const isSold = listing.status === 'sold';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#FAF7F2' }}>
        {cover ? (
          <img
            src={photoUrl(cover.storage_path)}
            alt=""
            width={720}
            height={630}
            style={{ width: 720, height: 630, objectFit: 'cover', opacity: isSold ? 0.6 : 1 }}
          />
        ) : null}

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: 56,
            direction: 'rtl',
          }}
        >
          <div style={{ display: 'flex', fontSize: 26, color: '#A55335', letterSpacing: 2 }}>
            RESTYLE
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 20,
              fontSize: 52,
              lineHeight: 1.2,
              color: '#22201D',
            }}
          >
            {listing.title.slice(0, 60)}
          </div>

          <div style={{ display: 'flex', marginTop: 22, fontSize: 28, color: '#6B645C' }}>
            {CONDITION_LABELS[listing.condition]} · {listing.pickup_city}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 30,
              fontSize: 60,
              color: isSold ? '#22201D' : '#A55335',
            }}
          >
            {isSold ? 'נמכר' : formatPrice(listing.price_agorot)}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
