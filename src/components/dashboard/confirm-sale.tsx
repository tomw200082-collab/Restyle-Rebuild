'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { confirmSale } from '@/lib/actions/orders';
import { SHIFT_HOURS, type Shift } from '@/lib/scheduling';
import { formatShortDate } from '@/lib/format';

const SHIFT_LABEL: Record<Shift, string> = {
  morning: 'בוקר',
  afternoon: 'צהריים',
  evening: 'ערב',
};

type Draft = { date: string; shift: Shift | '' };

/**
 * The seller proposes windows; the platform schedules. Only the platform knows
 * crew capacity, so letting the seller pick a real slot would produce a
 * calendar we cannot honour. [D-14]
 *
 * The picker only ever offers legal slots — no Saturdays, Fridays mornings
 * only — because an appointment nobody keeps costs more than the convenience
 * of offering it. [D-32]
 */
export function ConfirmSale({
  orderId,
  hoursLeft,
  dates,
}: {
  orderId: string;
  hoursLeft: number;
  /**
   * Computed on the server and passed in. It used to be
   * `useMemo(() => availableDates(new Date(), 21), [])` right here, and that is
   * a hydration mismatch waiting for midnight: the server renders the list from
   * its `new Date()`, the browser recomputes from its own a moment later, and
   * either side of 00:00 the two lists differ. React then throws away the
   * server's markup for this subtree and re-renders it, which detaches the
   * `<select>` the seller — or Playwright — was in the middle of using. [D-90]
   */
  dates: Array<{ date: string; shifts: Shift[] }>;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState<Draft[]>([
    { date: '', shift: '' },
    { date: '', shift: '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shiftsFor = (date: string) => dates.find((d) => d.date === date)?.shifts ?? [];

  function update(index: number, patch: Partial<Draft>) {
    setSlots((prev) =>
      prev.map((slot, i) => {
        if (i !== index) return slot;
        const next = { ...slot, ...patch };
        // Changing the date can invalidate the chosen shift — a Friday
        // evening must not survive a switch from a Tuesday.
        if (patch.date && !shiftsFor(patch.date).includes(next.shift as Shift)) next.shift = '';
        return next;
      }),
    );
  }

  function submit() {
    setError(null);
    const filled = slots.filter((s): s is { date: string; shift: Shift } =>
      Boolean(s.date && s.shift),
    );

    startTransition(async () => {
      const result = await confirmSale({ orderId, windows: filled });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const ready = slots.filter((s) => s.date && s.shift).length >= 2;

  return (
    <section className="rounded-lg border border-clay bg-clay-soft p-5" data-testid="confirm-sale">
      <h2 className="text-h3 text-ink">אישור המכירה</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        הקונה כבר שילם והכסף מוחזק אצלנו. בחרו 2–3 מועדים שנוחים לכם לאיסוף, ואנחנו נתאם.
      </p>
      <p className="mt-1 text-body-sm font-medium text-clay-hover">
        נותרו {hoursLeft} שעות לאשר.
      </p>

      <div className="mt-4 space-y-3">
        {slots.map((slot, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            <Select
              value={slot.date}
              onChange={(e) => update(index, { date: e.target.value })}
              aria-label={`תאריך אפשרות ${index + 1}`}
            >
              <option value="">בחרו תאריך</option>
              {dates.map((d) => (
                <option key={d.date} value={d.date}>
                  {formatShortDate(`${d.date}T00:00:00`)}
                </option>
              ))}
            </Select>

            <Select
              value={slot.shift}
              onChange={(e) => update(index, { shift: e.target.value as Shift })}
              disabled={!slot.date}
              aria-label={`שעות אפשרות ${index + 1}`}
            >
              <option value="">בחרו שעות</option>
              {shiftsFor(slot.date).map((shift) => (
                <option key={shift} value={shift}>
                  {SHIFT_LABEL[shift]} {SHIFT_HOURS[shift]}
                </option>
              ))}
            </Select>
          </div>
        ))}

        {slots.length < 3 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSlots((p) => [...p, { date: '', shift: '' }])}
          >
            הוספת מועד שלישי
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-body-sm text-danger" role="alert" data-testid="confirm-error">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <Button size="lg" onClick={submit} disabled={!ready || pending} data-testid="confirm-submit">
          {pending ? 'שולחים…' : 'אישור המכירה'}
        </Button>
      </div>
    </section>
  );
}
