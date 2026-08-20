import { renderSitemapIndex, sitemapChunkCount } from '@/lib/seo/sitemap-data';
import { env } from '@/lib/env';

export const revalidate = 3600;

const SITE = env.siteUrl.replace(/\/$/, '');

/**
 * The sitemap index, at the one URL every crawler and Search Console tries
 * first.
 *
 * Written as a route handler rather than through Next's `sitemap.ts` metadata
 * convention because that convention has no index form: adding
 * `generateSitemaps` moves the output to `/sitemap/<id>.xml` and leaves
 * `/sitemap.xml` returning a 404 — a silent failure, since nothing in the app
 * ever asks for it.
 */
export async function GET() {
  const count = await sitemapChunkCount();

  return new Response(renderSitemapIndex(SITE, count, new Date()), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
