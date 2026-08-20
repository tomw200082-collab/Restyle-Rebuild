'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPrice, formatShortDate, hoursUntil, parseShekelsToAgorot } from '@/lib/format';
import { OFFER_STATUS_LABELS } from '@/lib/labels';
import { acceptCounterOffer, respondToOffer } from '@/lib/actions/offers';
import type { Enums } from '@/types/database';

export type OfferRow = {
  id: string;
  amount_agorot: number;
  counter_amount_agorot: number | null;
  status: Enums<'offer_status'>;
  expires_at: string;
  checkout_expires_at: string | null;
  created_at: string;
  listings: { id: string; slug: string; title: string; price_agorot: number } | null;
};

const TONE: Record<Enums<'offer_status'>, 'neutral' | 'success' | 'warning' | 'danger' | 'clay'> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
  countered: 'clay',
  expired: 'neutral',
};

export function OfferList({ offers, role }: { offers: OfferRow[]; role: 'buyer' | 'seller' }) {
  return (
    <ul className="space-y-3">
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} role={role} />
      ))}
    </ul>
  );
}

function OfferCard({ offer, role }: { offer: OfferRow; role: 'buyer' | 'seller' }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [countering, setCountering] = useState(false);
  const [counter, setCounter] = useState('');
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? 'לא הצלחנו לבצע את הפעולה');
      else router.refresh();
    });
  }

  const price = offer.listings?.price_agorot ?? 0;
  const hoursLeft = hoursUntil(offer.expires_at);

  return (
    <li className="rounded-lg border border-line bg-surface p-4" data-testid="offer-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/item/${offer.listings?.slug}`} className="text-body text-ink hover:underline">
            {offer.listings?.title}
          </Link>
          <p className="mt-1 text-body-sm text-ink-muted">
            הצעה: <span className="tabular text-ink">{formatPrice(offer.amount_agorot)}</span>
            {' · '}מחיר מבוקש: <span className="tabular">{formatPrice(price)}</span>
          </p>
          {offer.counter_amount_agorot ? (
            <p className="mt-1 text-body-sm text-clay">
              הצעה נגדית: <span className="tabular">{formatPrice(offer.counter_amount_agorot)}</span>
            </p>
          ) : null}
          <p className="mt-1 text-caption text-ink-subtle">
            {formatShortDate(offer.created_at)}
            {offer.status === 'pending' || offer.status === 'countered'
              ? ` · נותרו ${hoursLeft} שעות`
              : ''}
          </p>
        </div>

        <Badge tone={TONE[offer.status]}>{OFFER_STATUS_LABELS[offer.status]}</Badge>
      </div>

      {role === 'seller' && offer.status === 'pending' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => respondToOffer({ offerId: offer.id, action: 'accept' }))}
            data-testid="offer-accept"
          >
            קבלה
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => respondToOffer({ offerId: offer.id, action: 'decline' }))}
          >
            דחייה
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setCountering((v) => !v)}>
            הצעה נגדית
          </Button>

          {countering ? (
            <div className="flex w-full items-center gap-2 pt-2">
              <Input
                inputMode="numeric"
                dir="ltr"
                className="max-w-32 text-start"
                value={counter}
                onChange={(e) => setCounter(e.target.value)}
                placeholder="סכום"
                aria-label="סכום ההצעה הנגדית"
              />
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    respondToOffer({
                      offerId: offer.id,
                      action: 'counter',
                      counter_amount_agorot: parseShekelsToAgorot(counter) ?? 0,
                    }),
                  )
                }
              >
                שליחה
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {role === 'buyer' && offer.status === 'countered' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => acceptCounterOffer(offer.id))}
          >
            קבלת ההצעה הנגדית
          </Button>
        </div>
      ) : null}

      {role === 'buyer' && offer.status === 'accepted' ? (
        <div className="mt-4">
          <Button asChild size="sm" data-testid="offer-checkout">
            <Link href={`/checkout/new?listing=${offer.listings?.id}&offer=${offer.id}`}>
              השלמת הרכישה במחיר שסוכם
            </Link>
          </Button>
          <p className="mt-2 text-caption text-ink-subtle">
            הפריט נשאר זמין לרכישה במחיר המלא עד שתשלימו את הרכישה.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
