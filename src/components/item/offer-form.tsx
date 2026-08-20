'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { formatPrice, parseShekelsToAgorot } from '@/lib/format';
import { submitOffer } from '@/lib/actions/offers';

export function OfferForm({
  listingId,
  slug,
  priceAgorot,
  minimumAgorot,
  expiryHours,
  checkoutHours,
}: {
  listingId: string;
  slug: string;
  priceAgorot: number;
  minimumAgorot: number;
  expiryHours: number;
  checkoutHours: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const agorot = parseShekelsToAgorot(amount);
  const belowMinimum = agorot !== null && agorot < minimumAgorot;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitOffer({ listingId, amount_agorot: agorot ?? 0 });
      if (!result.ok) setError(result.error);
      else router.push('/dashboard/buyer?tab=offers');
    });
  }

  return (
    <div className="mt-8 space-y-5">
      <dl className="rounded-lg border border-line bg-surface p-4 text-body-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">מחיר מבוקש</dt>
          <dd className="text-ink tabular">{formatPrice(priceAgorot)}</dd>
        </div>
        <div className="mt-1 flex justify-between">
          <dt className="text-ink-muted">הצעה מינימלית</dt>
          <dd className="text-ink tabular" data-testid="offer-minimum">
            {formatPrice(minimumAgorot)}
          </dd>
        </div>
      </dl>

      <Field
        label="הסכום שאתם מציעים"
        htmlFor="offer-amount"
        error={belowMinimum ? `ההצעה המינימלית היא ${formatPrice(minimumAgorot)}` : undefined}
      >
        <Input
          id="offer-amount"
          inputMode="numeric"
          dir="ltr"
          className="text-start"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          invalid={belowMinimum}
        />
      </Field>

      <p className="rounded-md bg-sand px-3 py-2 text-body-sm text-ink-muted">
        למוכר יש {expiryHours} שעות להשיב. אם ההצעה תתקבל, יהיו לכם {checkoutHours} שעות להשלים את
        הרכישה במחיר שסוכם. הפריט נשאר זמין לרכישה במחיר המלא עד אז.
      </p>

      {error ? (
        <p className="text-body-sm text-danger" role="alert" data-testid="offer-error">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button
          size="lg"
          onClick={submit}
          disabled={pending || agorot === null || belowMinimum}
          data-testid="offer-submit"
        >
          {pending ? 'שולחים…' : 'שליחת הצעה'}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => router.push(`/item/${slug}`)}>
          חזרה לפריט
        </Button>
      </div>
    </div>
  );
}
