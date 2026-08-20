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
        ],
      },
    ];
  },
};

export default nextConfig;
