'use client';

import { useState } from 'react';
import { Field, Input } from '@/components/ui/input';
import { formatPrice, parseShekelsToAgorot } from '@/lib/format';

/**
 * The gross/net distinction is the single most likely thing to surprise a
 * seller migrating from the old platform, where they named a NET price and the
 * platform added a markup on top. Here they name the GROSS price and the
 * commission comes out of it. A number they can see is the only reliable
 * defence against a mental model they can't. [D-36], ANALYSIS 7 C-1
 */
export function FeeCalculator({ commissionPct }: { commissionPct: number }) {
  const [value, setValue] = useState('1200');

  const agorot = parseShekelsToAgorot(value);
  const payout = agorot === null ? null : agorot - Math.floor((agorot * commissionPct) / 100);

  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <h3 className="text-h3 text-ink">כמה אקבל?</h3>

      <div className="mt-4">
        <Field label="מחיר מבוקש" htmlFor="fee-price" hint="זה המחיר שהקונה משלם.">
          <Input
            id="fee-price"
            inputMode="numeric"
            dir="ltr"
            className="text-start"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <p className="text-caption text-ink-muted">תקבלו</p>
        <p className="font-display text-h1 text-clay tabular" data-testid="calculator-payout">
          {payout === null ? '—' : formatPrice(payout)}
        </p>
        <p className="mt-2 text-body-sm text-ink-subtle">
          עמלת Restyle {commissionPct}% נגבית רק כשהפריט נמכר. פרסום תמיד חינם.
        </p>
      </div>
    </div>
  );
}
