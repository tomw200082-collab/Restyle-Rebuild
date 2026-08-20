'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { markPayoutPaid } from '@/lib/actions/admin';

export function MarkPaidButton({ payoutId }: { payoutId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('העברה בנקאית');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} data-testid="mark-paid">
        סימון כשולם
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="אופן ההעברה"
        className="h-9 max-w-44"
        data-testid="payout-method"
      />
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await markPayoutPaid(payoutId, note);
            if (!result.ok) setError(result.error);
            else {
              setOpen(false);
              router.refresh();
            }
          })
        }
        data-testid="mark-paid-confirm"
      >
        {pending ? 'שומרים…' : 'אישור'}
      </Button>
      {error ? (
        <span className="text-body-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
