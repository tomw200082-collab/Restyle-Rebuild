import Script from 'next/script';
import { env } from '@/lib/env';

/**
 * Google Analytics, rendered only when an id is configured.
 *
 * Absent by default — the id is empty in `.env.example` — so local development
 * and the test suite never send events, and no third-party script runs in CI.
 *
 * `afterInteractive` rather than `beforeInteractive`: analytics must never sit
 * on the critical path of a photography-first page whose LCP is an image.
 *
 * Note that the CSP does not allow `https://www.googletagmanager.com`. Adding
 * an id is therefore a two-line change: set `NEXT_PUBLIC_GA_ID` *and* add the
 * host to `script-src` and `connect-src` in `next.config.ts`. That is
 * deliberate — a CSP that pre-authorises a script host nobody uses is a hole
 * kept open for convenience.
 */
export function Analytics() {
  const id = env.gaId;
  if (!id) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${id}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
