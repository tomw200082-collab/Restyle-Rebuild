'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Signed = { payload: string; signature: string };

export function MockPayButtons({
  orderId,
  success,
  cancel,
}: {
  orderId: string;
  success: Signed;
  cancel: Signed;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(signed: Signed, destination: string) {
    setBusy(true);
    setError(null);

    const response = await fetch('/api/payments/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mock-signature': signed.signature },
      body: signed.payload,
    });

    if (!response.ok) {
      setError('התשלום נכשל. נסו שוב.');
      setBusy(false);
      return;
    }

    router.push(destination);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-3">
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => post(success, `/checkout/${orderId}/success`)}
        data-testid="mock-pay-success"
      >
        אישור תשלום
      </Button>

      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => post(cancel, `/checkout/${orderId}/cancelled`)}
        data-testid="mock-pay-cancel"
      >
        ביטול
      </Button>

      {error ? (
        <p className="text-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
