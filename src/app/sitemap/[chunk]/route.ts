import { notFound } from 'next/navigation';
import {
  URLS_PER_SITEMAP,
  allSitemapEntries,
  renderUrlset,
  sitemapChunkCount,
} from '@/lib/seo/sitemap-data';
import { env } from '@/lib/env';

export const revalidate = 3600;

const SITE = env.siteUrl.replace(/\/$/, '');

/**
 * One chunk of the sitemap, at `/sitemap/<n>.xml`.
 *
 * Chunking is not premature: the protocol rejects a file over 50,000 URLs
 * outright rather than truncating it, and programmatic category × city pages
 * multiply with the catalogue.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ chunk: string }> }) {
  const { chunk } = await params;
  const id = Number(chunk.replace(/\.xml$/, ''));

  if (!Number.isInteger(id) || id < 0 || id >= (await sitemapChunkCount())) notFound();

  const entries = await allSitemapEntries();
  const start = id * URLS_PER_SITEMAP;

  return new Response(renderUrlset(SITE, entries.slice(start, start + URLS_PER_SITEMAP)), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

/** Pre-renders the chunks that exist at build time; more appear via ISR. */
export async function generateStaticParams() {
  const count = await sitemapChunkCount();
  return Array.from({ length: count }, (_, id) => ({ chunk: `${id}.xml` }));
}
