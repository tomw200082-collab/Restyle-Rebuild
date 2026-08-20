'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { resolveDispute } from '@/lib/actions/admin';
import { formatPrice, parseShekelsToAgorot } from '@/lib/format';

type Resolution = 'resolved_refund' | 'resolved_partial' | 'rejected';

export function ResolveDispute({
  disputeId,
  totalAgorot,
}: {
  disputeId: string;
  totalAgorot: number;
}) {
  const router = useRouter();
  const [resolution, setResolution] = useState<Resolution | ''>('');
  const [partial, setPartial] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await resolveDispute({
        disputeId,
        resolution,
        refund_agorot:
          resolution === 'resolved_partial' ? (parseShekelsToAgorot(partial) ?? 0) : undefined,
        note,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-line bg-canvas p-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['resolved_refund', `החזר מלא (${formatPrice(totalAgorot)})`],
            ['resolved_partial', 'החזר חלקי'],
            ['rejected', 'דחיית הבקשה'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={resolution === value ? 'primary' : 'secondary'}
            onClick={() => setResolution(value)}
            data-testid={`dispute-${value}`}
          >
            {label}
          </Button>
        ))}
      </div>

      {resolution === 'resolved_partial' ? (
        <Field label="סכום ההחזר" htmlFor={`partial-${disputeId}`}>
          <Input
            id={`partial-${disputeId}`}
            inputMode="numeric"
            dir="ltr"
            className="max-w-40 text-start"
            value={partial}
            onChange={(e) => setPartial(e.target.value)}
          />
        </Field>
      ) : null}

      {resolution ? (
        <>
          <Field
            label="נימוק ההחלטה"
            htmlFor={`note-${disputeId}`}
            hint="נשלח לקונה כמו שהוא ונשמר ביומן ההזמנה."
          >
            <Textarea
              id={`note-${disputeId}`}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="dispute-note"
            />
          </Field>

          {error ? (
            <p className="text-body-sm text-danger" role="alert" data-testid="dispute-error">
              {error}
            </p>
          ) : null}

          <Button
            disabled={pending || note.trim().length < 3}
            onClick={submit}
            data-testid="dispute-resolve"
          >
            {pending ? 'שומרים…' : 'החלטה סופית'}
          </Button>
        </>
      ) : null}
    </div>
  );
}
