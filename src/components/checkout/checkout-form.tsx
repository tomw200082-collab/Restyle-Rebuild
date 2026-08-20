'use client';

import { useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { formatPrice } from '@/lib/format';
import { computeOrderPricing, OutOfServiceAreaError } from '@/lib/pricing/engine';
import { zoneLookupFrom, type ZoneRow } from '@/lib/pricing/config.shared';
import { coverPhoto, photoUrl } from '@/lib/storage';
import { startCheckout } from '@/lib/actions/checkout';
import type { PricingConfig } from '@/lib/pricing/types';
import { cn } from '@/lib/utils';

type Listing = {
  id: string;
  title: string;
  price_agorot: number;
  pickup_city: string;
  pickup_floor: number;
  pickup_has_elevator: boolean;
  needs_disassembly: boolean;
  allow_self_pickup: boolean;
  commission_pct_override: number | null;
  listing_photos: Array<{ storage_path: string; alt_text: string | null; sort: number }>;
};

export function CheckoutForm({
  listing,
  offerId,
  offerAmount,
  config,
  zones,
  protectionHours,
}: {
  listing: Listing;
  offerId: string | null;
  offerAmount: number | null;
  config: PricingConfig;
  zones: ZoneRow[];
  protectionHours: number;
}) {
  const [method, setMethod] = useState<'platform' | 'self_pickup'>('platform');
  const [city, setCity] = useState('');
  const [street, setStreet] = useState('');
  const [floor, setFloor] = useState('0');
  const [hasElevator, setHasElevator] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lookupZone = useMemo(() => zoneLookupFrom(zones), [zones]);
  const cover = coverPhoto(listing.listing_photos);

  // The same pure engine the server recomputes with. This figure is display
  // only — the server never trusts it. [D-18], [D-19]
  const pricing = useMemo(() => {
    if (method === 'platform' && !city) return null;
    try {
      return computeOrderPricing(
        listing,
        method === 'self_pickup'
          ? { method: 'self_pickup' }
          : { method: 'platform', city, floor: Number(floor) || 0, hasElevator },
        config,
        lookupZone,
        offerAmount !== null ? { itemPriceOverride: offerAmount } : {},
      );
    } catch (err) {
      void (err instanceof OutOfServiceAreaError);
      return null;
    }
  }, [listing, method, city, floor, hasElevator, config, lookupZone, offerAmount]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await startCheckout({
        listingId: listing.id,
        offerId,
        delivery_method: method,
        dropoff_city: method === 'platform' ? city : undefined,
        dropoff_street: method === 'platform' ? street : undefined,
        dropoff_floor: method === 'platform' ? Number(floor) || 0 : undefined,
        dropoff_has_elevator: method === 'platform' ? hasElevator : undefined,
        dropoff_notes: notes || undefined,
      });
      // A successful action redirects, so reaching here means it failed.
      if (result && !result.ok) setError(result.error);
    });
  }

  const canSubmit =
    method === 'self_pickup' || (city !== '' && street.trim().length >= 3 && pricing !== null);

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        <fieldset className="space-y-3">
          <legend className="text-h3 text-ink">אופן המסירה</legend>

          <MethodOption
            checked={method === 'platform'}
            onChange={() => setMethod('platform')}
            title="הובלה עד הבית"
            body="צוות שלנו אוסף מהמוכר ומביא אליכם במועד שנקבע מראש."
          />
          {listing.allow_self_pickup ? (
            <MethodOption
              checked={method === 'self_pickup'}
              onChange={() => setMethod('self_pickup')}
              title="איסוף עצמי — ללא עלות הובלה"
              body="פרטי המוכר ומועד האיסוף נמסרים אחרי התשלום."
              testId="self-pickup-option"
            />
          ) : null}
        </fieldset>

        {method === 'platform' ? (
          <div className="space-y-4">
            <Field label="עיר" htmlFor="dropoff-city">
              <Select id="dropoff-city" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">בחרו עיר</option>
                {zones.map((z) => (
                  <option key={z.city} value={z.city}>{z.city}</option>
                ))}
              </Select>
            </Field>

            <Field label="רחוב ומספר" htmlFor="dropoff-street">
              <Input id="dropoff-street" value={street} onChange={(e) => setStreet(e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="קומה" htmlFor="dropoff-floor">
                <Select id="dropoff-floor" value={floor} onChange={(e) => setFloor(e.target.value)}>
                  {Array.from({ length: 21 }, (_, i) => (
                    <option key={i} value={String(i)}>{i === 0 ? 'קרקע' : i}</option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end pb-3">
                <label className="flex items-center gap-2 text-body text-ink">
                  <input
                    type="checkbox"
                    checked={hasElevator}
                    onChange={(e) => setHasElevator(e.target.checked)}
                    className="size-4 rounded-sm border-line-strong accent-[var(--color-clay)]"
                  />
                  יש מעלית
                </label>
              </div>
            </div>

            <Field label="הערות לצוות" htmlFor="dropoff-notes" optional>
              <Textarea
                id="dropoff-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="לדוגמה: הכניסה מהחצר האחורית"
              />
            </Field>
          </div>
        ) : null}
      </div>

      <aside className="lg:col-span-5">
        <div className="lg:sticky lg:top-24 space-y-4 rounded-lg border border-line bg-surface p-5">
          <h2 className="text-h3 text-ink">סיכום הזמנה</h2>

          <div className="flex gap-3">
            {cover ? (
              <Image
                src={photoUrl(cover.storage_path)}
                alt=""
                width={120}
                height={90}
                sizes="120px"
                className="aspect-4/3 w-24 rounded-md object-cover"
              />
            ) : null}
            <p className="text-body-sm text-ink">{listing.title}</p>
          </div>

          {pricing ? (
            <dl
              className="space-y-1.5 border-t border-line pt-4 text-body-sm"
              data-testid="checkout-summary"
            >
              <SummaryRow label="מחיר הפריט" value={formatPrice(pricing.item_agorot)} />
              {offerAmount !== null ? (
                <p className="text-caption text-success">מחיר מוסכם לפי ההצעה שהתקבלה</p>
              ) : null}
              <SummaryRow
                label="הובלה"
                value={formatPrice(pricing.delivery_agorot)}
                testId="checkout-delivery"
              />
              {pricing.surcharges.map((s) => (
                <SummaryRow key={s.code} label={s.label} value={formatPrice(s.amount_agorot)} />
              ))}
              <div className="flex items-baseline justify-between border-t border-line pt-2 text-body font-medium text-ink">
                <dt>סה״כ לתשלום</dt>
                <dd className="tabular" data-testid="checkout-total">
                  {formatPrice(pricing.total_agorot)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-body-sm text-ink-muted">בחרו עיר כדי לראות את הסכום הסופי.</p>
          )}

          <p className="rounded-md bg-sand px-3 py-2 text-body-sm text-ink-muted">
            הכסף מוגן: יש לכם {protectionHours} שעות אחרי המסירה לוודא שהכל תקין.
          </p>

          {error ? (
            <p className="text-body-sm text-danger" role="alert" data-testid="checkout-error">
              {error}
            </p>
          ) : null}

          <Button
            size="lg"
            className="w-full"
            onClick={submit}
            disabled={!canSubmit || pending}
            data-testid="checkout-submit"
          >
            {pending ? 'רגע…' : 'לתשלום מאובטח'}
          </Button>

          <p className="text-caption text-ink-subtle">
            בלחיצה על תשלום אתם מאשרים את התקנון ומדיניות הביטולים.
          </p>
        </div>
      </aside>
    </div>
  );
}

function MethodOption({
  checked,
  onChange,
  title,
  body,
  testId,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  body: string;
  testId?: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors',
        checked ? 'border-clay bg-clay-soft' : 'border-line bg-surface hover:bg-sand',
      )}
      data-testid={testId}
    >
      <input
        type="radio"
        name="delivery-method"
        checked={checked}
        onChange={onChange}
        className="mt-1 size-4 accent-[var(--color-clay)]"
      />
      <span>
        <span className="block text-body font-medium text-ink">{title}</span>
        <span className="block text-body-sm text-ink-muted">{body}</span>
      </span>
    </label>
  );
}

function SummaryRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between text-ink-muted">
      <dt>{label}</dt>
      <dd className="tabular" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
