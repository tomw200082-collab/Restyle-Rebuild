'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cancelOrderAsBuyer } from '@/lib/actions/orders';
import { formatPrice } from '@/lib/format';
import type { Enums } from '@/types/database';

const CANCELLABLE: Enums<'order_status'>[] = [
  'pending_seller_confirmation',
  'confirmed',
  'delivery_scheduled',
];

export function BuyerOrderActions({
  orderId,
  status,
  cancellationFeeAgorot,
}: {
  orderId: string;
  status: Enums<'order_status'>;
  cancellationFeeAgorot: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canCancel = CANCELLABLE.includes(status);
  const canDispute = status === 'delivered';

  if (!canCancel && !canDispute) return null;

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrderAsBuyer({ orderId });
      if (!result.ok) setError(result.error);
      else {
        setConfirming(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-5">
      {canDispute ? (
        <Button asChild variant="secondary" className="w-full">
          <Link href={`/dashboard/buyer/orders/${orderId}/dispute`}>פתיחת בקשת בירור</Link>
        </Button>
      ) : null}

      {canCancel ? (
        confirming ? (
          <div className="space-y-3">
            <p className="text-body-sm text-ink">
              לבטל את ההזמנה?
              {/* The fee is published in the Terms and the Cancellation
                  Policy, so it must be stated before it is charged. [D-40] */}
              {cancellationFeeAgorot > 0
                ? ` לאחר אישור המוכר, הביטול כרוך בעלות תפעול של ${formatPrice(cancellationFeeAgorot)}. היתרה תוחזר לכם.`
                : ' לא תחויבו כלל והכסף יוחזר במלואו.'}
            </p>
            <div className="flex gap-2">
              <Button variant="danger" disabled={pending} onClick={cancel} data-testid="cancel-confirm">
                {pending ? 'מבטלים…' : 'כן, בטלו'}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                חזרה
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setConfirming(true)}
            data-testid="cancel-order"
          >
            ביטול ההזמנה
          </Button>
        )
      ) : null}

      {error ? (
        <p className="text-body-sm text-danger" role="alert" data-testid="cancel-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
