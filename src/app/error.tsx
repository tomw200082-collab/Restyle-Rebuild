'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { CONTACT } from '@/lib/env';

/**
 * The route-level error boundary.
 *
 * `digest` is the only identifier that ties what the user saw to what the
 * server logged — the message itself is stripped in production, deliberately,
 * so it cannot leak internals. Showing it is what makes a support conversation
 * possible at all.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('route error', error.digest ?? '', error.message);
  }, [error]);

  return (
    <Container className="py-24">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="font-display text-h1 text-ink">משהו השתבש אצלנו</h1>
        <p className="mt-3 text-body-lg text-ink-muted">
          זו תקלה בצד שלנו, לא משהו שעשיתם. אפשר לנסות שוב — ואם זה חוזר, נשמח שתכתבו לנו.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={reset}>
            נסו שוב
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/">לדף הבית</Link>
          </Button>
        </div>

        <p className="mt-8 text-body-sm text-ink-muted">
          <a href={`mailto:${CONTACT.supportEmail}`} className="text-clay hover:underline">
            {CONTACT.supportEmail}
          </a>
          {error.digest ? (
            <>
              {' · '}
              קוד תקלה <span className="ltr-isolate tabular">{error.digest}</span>
            </>
          ) : null}
        </p>
      </div>
    </Container>
  );
}
