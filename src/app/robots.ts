import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

const SITE = env.siteUrl.replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Nothing here is indexable, and several of these are authenticated —
        // keeping them out of the crawl budget matters as much as keeping them
        // out of the index.
        disallow: ['/admin', '/dashboard', '/checkout', '/pay', '/api', '/login', '/auth'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
