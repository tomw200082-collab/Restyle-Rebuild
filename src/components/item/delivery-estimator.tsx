'use client';

import { useMemo, useState } from 'react';
import { Select } from '@/components/ui/input';
import { formatPrice } from '@/lib/format';
import { computeOrderPricing, OutOfServiceAreaError } from '@/lib/pricing/engine';
import { zoneLookupFrom, type ZoneRow } from '@/lib/pricing/config.shared';
import type { PricingConfig, PricingListing } from '@/lib/pricing/types';

/**
 * The estimator runs the *same* pure fee function the server uses at checkout,
 * imported directly into the browser. That is the point of keeping the engine
 * I/O-free: no round trip, and no second implementation to drift. The server
 * still recomputes and rejects a mismatched total — the client figure is a
 * display artefact, never an input. [D-18], [D-19]
 */
export function DeliveryEstimator({
  listing,
  config,
  zones,
}: {
  listing: PricingListing;
  config: PricingConfig;
  zones: ZoneRow[];
}) {
  const [city, setCity] = useState('');
  const [floor, setFloor] = useState('0');
  const [hasElevator, setHasElevator] = useState(true);

  const lookupZone = useMemo(() => zoneLookupFrom(zones), [zones]);

  const quote = useMemo(() => {
    if (!city) return null;
    try {
      return computeOrderPricing(
        listing,
        { method: 'platform', city, floor: Number(floor) || 0, hasElevator },
        config,
        lookupZone,
      );
    } catch (err) {
      return err instanceof OutOfServiceAreaError ? { error: err.message } : { error: 'שגיאה בחישוב' };
    }
  }, [city, floor, hasElevator, listing, config, lookupZone]);

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-h3 text-ink">חישוב עלות הובלה</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        בחרו עיר כדי לראות את עלות ההובלה אליכם.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="est-city" className="block text-caption font-medium text-ink-muted">
            עיר
          </label>
          <Select id="est-city" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">בחרו עיר</option>
            {zones.map((z) => (
              <option key={z.city} value={z.city}>
                {z.city}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="est-floor" className="block text-caption font-medium text-ink-muted">
            קומה
          </label>
          <Select id="est-floor" value={floor} onChange={(e) => setFloor(e.target.value)}>
            {Array.from({ length: 21 }, (_, i) => (
              <option key={i} value={String(i)}>
                {i === 0 ? 'קרקע' : i}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-body-sm text-ink">
        <input
          type="checkbox"
          checked={hasElevator}
          onChange={(e) => setHasElevator(e.target.checked)}
          className="size-4 rounded-sm border-line-strong accent-[var(--color-clay)]"
        />
        יש מעלית
      </label>

      {quote && 'error' in quote ? (
        <p className="mt-4 text-body-sm text-danger" role="status">
          {quote.error}
        </p>
      ) : quote ? (
        <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-body-sm" data-testid="delivery-quote">
          <Row label="מחיר הפריט" value={formatPrice(quote.item_agorot)} />
          <Row label="הובלה" value={formatPrice(quote.delivery_agorot)} testId="quote-delivery" />
          {quote.surcharges.map((s) => (
            <Row key={s.code} label={s.label} value={formatPrice(s.amount_agorot)} />
          ))}
          <div className="flex items-baseline justify-between border-t border-line pt-2 text-body font-medium text-ink">
            <dt>סה״כ</dt>
            <dd className="tabular" data-testid="quote-total">
              {formatPrice(quote.total_agorot)}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between text-ink-muted">
      <dt>{label}</dt>
      <dd className="tabular" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
