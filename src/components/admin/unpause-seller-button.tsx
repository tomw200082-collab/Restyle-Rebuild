'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { unpauseSeller } from '@/lib/actions/admin';

/**
 * The human override on the seller-pause automation.
 *
 * This button is why the automation is safe to run at all: an operator who has
 * spoken to the seller undoes it in one click, and the counter resets with it.
 * It restores every paused listing for the seller, not just the row it sits on —
 * the pause was applied to the seller, so the undo is too, and unpausing one
 * item at a time would leave a half-paused catalogue nobody could reason
 * about. [D-74]
 */
export function UnpauseSellerButton({
  sellerId,
  sellerName,
}: {
  sellerId: string;
  sellerName: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        data-testid="unpause-seller"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await unpauseSeller(sellerId);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? 'מחזיר…' : 'החזרת הפריטים'}
      </Button>
      <span className="text-caption text-ink-muted">
        מחזיר את כל הפריטים המושהים של {sellerName ?? 'המוכר'}
      </span>
      {error ? (
        <span role="alert" className="text-caption text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
