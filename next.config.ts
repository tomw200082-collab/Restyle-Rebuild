import type { NextConfig } from 'next';

const supabaseUrl = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321');
  } catch {
    return new URL('http://127.0.0.1:54321');
  }
})();

const supabaseHost = supabaseUrl.hostname;

/**
 * Next's image optimiser refuses private-IP upstreams as SSRF protection —
 * correct, and it would block the local Supabase-compatible stack. Enable the
 * escape hatch ONLY when the configured Supabase host is itself a loopback
 * address, so a production deployment can never turn it on by accident.
 */
const supabaseIsLoopback = ['127.0.0.1', 'localhost', '::1'].includes(supabaseHost);

/**
 * Keyed on the site's own scheme, not `NODE_ENV`.
 *
 * `next start` runs with NODE_ENV=production locally too, and both of the
 * headers below are actively harmful over http: `upgrade-insecure-requests`
 * rewrites every http upstream to https — which silently broke sign-in and
 * favourites against a local Supabase on http — and HSTS pins the browser to
 * https for a hostname that has no certificate, for two years, outliving the
 * session that set it.
 */
const siteUrl = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
  } catch {
    return new URL('http://localhost:3000');
  }
})();

const isHttps = siteUrl.protocol === 'https:';

/**
 * Content-Security-Policy.
 *
 * Deliberately **not** nonce-based. A per-request nonce has to be generated in
 * middleware and injected into the HTML, which makes every page dynamic — and
 * static rendering is the one thing the SEO strategy cannot give up. [D-46]
 *
 * So this constrains everything that can be constrained without a nonce.
 * `script-src` keeps `'unsafe-inline'` because Next's own bootstrap is inline
 * and there is no honest way around that here; the directives that actually
 * block the common attacks — framing, plugin embedding, `<base>` hijacking,
 * form exfiltration, and where XHR may go — are all strict.
 */
const CSP = [
  "default-src 'self'",
  // Next's hydration bootstrap is inline; see above.
  "script-src 'self' 'unsafe-inline'",
  // next/font injects inline @font-face declarations.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseUrl.origin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseUrl.origin} ${supabaseUrl.origin.replace(/^http/, 'ws')}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Belt and braces with X-Frame-Options, which older browsers honour instead.
  "frame-ancestors 'none'",
  ...(isHttps ? ['upgrade-insecure-requests'] : []),
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' },
      { protocol: 'http', hostname: 'localhost', pathname: '/storage/v1/object/public/**' },
      { protocol: 'http', hostname: '127.0.0.1', pathname: '/storage/v1/object/public/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    ...(supabaseIsLoopback ? { dangerouslyAllowLocalIP: true } : {}),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: CSP },
          // Only over https, for the reason given above the `isHttps` flag.
          ...(isHttps
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
      {
        // Machine and authenticated surfaces. `robots.ts` already disallows
        // these paths, but robots.txt is a request not to crawl; the header is
        // a request not to *index*, and the two are answered by different
        // parts of a crawler. A URL that leaks into an index from a link
        // elsewhere is not covered by the first and is by the second.
        source: '/:path(api|admin|dashboard|checkout|pay|login|auth)/:rest*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          // An authenticated page cached by an intermediary is one user's data
          // served to the next. `private` is not enough on its own — a shared
          // cache honours `no-store`, and these pages are never worth caching.
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
    ];
  },
};

export default nextConfig;
