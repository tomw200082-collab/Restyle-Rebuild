'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { markDelivered, markPickedUp, scheduleDelivery } from '@/lib/actions/admin';
import { SHIFT_HOURS, type Shift } from '@/lib/scheduling';
import { formatShortDate } from '@/lib/format';
import type { Enums } from '@/types/database';

const SHIFT_LABEL: Record<Shift, string> = {
  morning: 'בוקר',
  afternoon: 'צהריים',
  evening: 'ערב',
};

export function AdminOrderActions({
  orderId,
  status,
  proposedWindows,
  delivery,
  dates,
}: {
  orderId: string;
  status: Enums<'order_status'>;
  proposedWindows: Array<{ date: string; shift: string }>;
  /** Server-computed, for the same reason as `ConfirmSale`. [D-90] */
  dates: Array<{ date: string; shifts: Shift[] }>;
  delivery: {
    pickup_date: string | null;
    pickup_shift: Shift | null;
    dropoff_date: string | null;
    dropoff_shift: Shift | null;
    crew_name: string | null;
    crew_phone: string | null;
  } | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    pickup_date: proposedWindows[0]?.date ?? '',
    pickup_shift: (proposedWindows[0]?.shift as Shift) ?? '',
    dropoff_date: proposedWindows[0]?.date ?? '',
    dropoff_shift: '' as Shift | '',
    crew_name: delivery?.crew_name ?? '',
    crew_phone: delivery?.crew_phone ?? '',
    admin_notes: '',
  });
  const [inspectionNote, setInspectionNote] = useState('');

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const shiftsFor = (date: string) => dates.find((d) => d.date === date)?.shifts ?? [];

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? 'הפעולה נכשלה');
      else router.refresh();
    });
  }

  if (status === 'confirmed') {
    return (
      <section className="rounded-lg border border-clay bg-clay-soft p-5" data-testid="schedule-form">
        <h2 className="text-h3 text-ink">שיבוץ הובלה</h2>

        {proposedWindows.length > 0 ? (
          <div className="mt-2 text-body-sm text-ink-muted">
            המוכר הציע:{' '}
            {proposedWindows
              .map((w) => `${formatShortDate(`${w.date}T00:00:00`)} ${SHIFT_LABEL[w.shift as Shift]}`)
              .join(' · ')}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="תאריך איסוף" htmlFor="pickup-date">
            <Select
              id="pickup-date"
              value={form.pickup_date}
              onChange={(e) => set('pickup_date', e.target.value)}
            >
              <option value="">בחרו</option>
              {dates.map((d) => (
                <option key={d.date} value={d.date}>
                  {formatShortDate(`${d.date}T00:00:00`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="שעות איסוף" htmlFor="pickup-shift">
            <Select
              id="pickup-shift"
              value={form.pickup_shift}
              onChange={(e) => set('pickup_shift', e.target.value as Shift)}
              disabled={!form.pickup_date}
            >
              <option value="">בחרו</option>
              {shiftsFor(form.pickup_date).map((shift) => (
                <option key={shift} value={shift}>
                  {SHIFT_LABEL[shift]} {SHIFT_HOURS[shift]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="תאריך מסירה" htmlFor="dropoff-date">
            <Select
              id="dropoff-date"
              value={form.dropoff_date}
              onChange={(e) => set('dropoff_date', e.target.value)}
            >
              <option value="">בחרו</option>
              {dates.map((d) => (
                <option key={d.date} value={d.date}>
                  {formatShortDate(`${d.date}T00:00:00`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="שעות מסירה" htmlFor="dropoff-shift">
            <Select
              id="dropoff-shift"
              value={form.dropoff_shift}
              onChange={(e) => set('dropoff_shift', e.target.value as Shift)}
              disabled={!form.dropoff_date}
            >
              <option value="">בחרו</option>
              {shiftsFor(form.dropoff_date).map((shift) => (
                <option key={shift} value={shift}>
                  {SHIFT_LABEL[shift]} {SHIFT_HOURS[shift]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="שם הצוות" htmlFor="crew-name">
            <Input id="crew-name" value={form.crew_name} onChange={(e) => set('crew_name', e.target.value)} />
          </Field>

          <Field label="טלפון הצוות" htmlFor="crew-phone">
            <Input
              id="crew-phone"
              dir="ltr"
              className="text-start"
              value={form.crew_phone}
              onChange={(e) => set('crew_phone', e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="הערות לצוות" htmlFor="admin-notes" optional>
            <Textarea
              id="admin-notes"
              rows={2}
              value={form.admin_notes}
              onChange={(e) => set('admin_notes', e.target.value)}
            />
          </Field>
        </div>

        {error ? (
          <p className="mt-3 text-body-sm text-danger" role="alert" data-testid="schedule-error">
            {error}
          </p>
        ) : null}

        <div className="mt-4">
          <Button
            disabled={pending}
            onClick={() => run(() => scheduleDelivery({ orderId, ...form }))}
            data-testid="schedule-submit"
          >
            {pending ? 'משבצים…' : 'שיבוץ ועדכון הצדדים'}
          </Button>
        </div>
      </section>
    );
  }

  if (status === 'delivery_scheduled') {
    return (
      <section className="rounded-lg border border-line bg-surface p-5" data-testid="pickup-form">
        <h2 className="text-h3 text-ink">איסוף</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          הצוות בודק את הפריט מול המודעה. אי־התאמה מבטלת את העסקה ומחזירה לקונה את מלוא הסכום.
        </p>

        <div className="mt-3">
          <Field label="הערת בדיקה" htmlFor="inspection-note" optional>
            <Textarea
              id="inspection-note"
              rows={2}
              value={inspectionNote}
              onChange={(e) => setInspectionNote(e.target.value)}
            />
          </Field>
        </div>

        {error ? (
          <p className="mt-3 text-body-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              run(() => markPickedUp({ orderId, inspectionOk: true, note: inspectionNote || undefined }))
            }
            data-testid="mark-picked-up"
          >
            נאסף — תואם למודעה
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              run(() => markPickedUp({ orderId, inspectionOk: false, note: inspectionNote || undefined }))
            }
            data-testid="mark-inspection-failed"
          >
            אי־התאמה — ביטול והחזר
          </Button>
        </div>
      </section>
    );
  }

  if (status === 'picked_up') {
    return (
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-h3 text-ink">מסירה</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          סימון מסירה מפעיל את חלון הבדיקה של הקונה. בסופו התשלום משוחרר למוכר אוטומטית.
        </p>
        {error ? (
          <p className="mt-3 text-body-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4">
          <Button
            disabled={pending}
            onClick={() => run(() => markDelivered(orderId))}
            data-testid="mark-delivered"
          >
            סימון כנמסר
          </Button>
        </div>
      </section>
    );
  }

  return null;
}
