'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { reviewListing } from '@/lib/actions/admin';
import { formatDimensions, formatPrice, formatShortDate } from '@/lib/format';
import { photoUrl } from '@/lib/storage';
import { CONDITION_LABELS } from '@/lib/labels';
import type { Enums } from '@/types/database';

type ReviewListing = {
  id: string;
  title: string;
  description: string;
  price_agorot: number;
  original_price_agorot: number | null;
  condition: Enums<'listing_condition'>;
  width_cm: number;
  depth_cm: number;
  height_cm: number;
  pickup_city: string;
  pickup_floor: number;
  pickup_has_elevator: boolean;
  needs_disassembly: boolean;
  created_at: string;
  categories: { name_he: string } | null;
  brands: { name: string } | null;
  profiles: { full_name: string | null; email: string; phone: string | null } | null;
  listing_photos: Array<{ id: string; storage_path: string; alt_text: string | null; sort: number }>;
};

export function ReviewCard({ listing }: { listing: ReviewListing }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const photos = [...listing.listing_photos].sort((a, b) => a.sort - b.sort);

  function decide(decision: 'approve' | 'reject') {
    setError(null);
    startTransition(async () => {
      const result = await reviewListing({
        listingId: listing.id,
        decision,
        reason: decision === 'reject' ? reason : undefined,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li className="rounded-lg border border-line bg-surface p-5" data-testid="review-card">
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setZoom(photoUrl(photo.storage_path))}
                  className="block w-full overflow-hidden rounded-md"
                  aria-label="הגדלת תמונה"
                >
                  <Image
                    src={photoUrl(photo.storage_path)}
                    alt={photo.alt_text ?? ''}
                    width={400}
                    height={300}
                    sizes="200px"
                    className="aspect-4/3 w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 lg:col-span-7">
          <div>
            <h2 className="text-h3 text-ink">{listing.title}</h2>
            <p className="mt-1 text-body-sm text-ink-muted">
              {formatShortDate(listing.created_at)} · {listing.profiles?.full_name ?? 'מוכר'} ·{' '}
              <span className="ltr-isolate">{listing.profiles?.email}</span>
            </p>
          </div>

          <p className="whitespace-pre-line text-body-sm text-ink-muted">{listing.description}</p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-body-sm">
            <Spec label="מחיר" value={formatPrice(listing.price_agorot)} />
            <Spec
              label="מחיר קטלוגי"
              value={listing.original_price_agorot ? formatPrice(listing.original_price_agorot) : '—'}
            />
            <Spec label="קטגוריה" value={listing.categories?.name_he ?? '—'} />
            <Spec label="מותג" value={listing.brands?.name ?? '—'} />
            <Spec label="מצב" value={CONDITION_LABELS[listing.condition]} />
            <Spec
              label="מידות"
              value={`${formatDimensions(listing.width_cm, listing.depth_cm, listing.height_cm)} ס״מ`}
            />
            <Spec
              label="איסוף"
              value={`${listing.pickup_city} · קומה ${listing.pickup_floor}${
                listing.pickup_has_elevator ? ' · מעלית' : ' · ללא מעלית'
              }`}
            />
            <Spec label="פירוק" value={listing.needs_disassembly ? 'נדרש' : 'לא נדרש'} />
          </dl>

          {rejecting ? (
            <div className="space-y-2">
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="מה צריך לתקן? הטקסט הזה נשלח למוכר כמו שהוא."
                aria-label="סיבת דחייה"
                data-testid="reject-reason"
              />
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending || reason.trim().length < 3}
                  onClick={() => decide('reject')}
                  data-testid="reject-confirm"
                >
                  שליחת דחייה
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                  ביטול
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => decide('approve')} data-testid="approve">
                אישור ופרסום
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setRejecting(true)} data-testid="reject">
                דחייה
              </Button>
            </div>
          )}

          {error ? (
            <p className="text-body-sm text-danger" role="alert" data-testid="review-error">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {zoom ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
          onClick={() => setZoom(null)}
          role="dialog"
          aria-label="תצוגת תמונה"
        >
          <Image src={zoom} alt="" width={1600} height={1200} className="max-h-full w-auto rounded-lg" />
        </div>
      ) : null}
    </li>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </>
  );
}
