/**
 * Sitemap XML rendering.
 *
 * Deliberately free of imports: this is pure string work, so it is unit
 * testable without dragging the `server-only` data layer into a test runner.
 */
export type SitemapEntry = {
  path: string;
  lastModified: Date;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
};

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** A slug can legitimately contain an ampersand; an unescaped one is invalid XML. */
export const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);

export function renderUrlset(site: string, entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (entry) =>
        `  <url>\n` +
        `    <loc>${escapeXml(site + entry.path)}</loc>\n` +
        `    <lastmod>${entry.lastModified.toISOString()}</lastmod>\n` +
        `    <changefreq>${entry.changeFrequency}</changefreq>\n` +
        `    <priority>${entry.priority.toFixed(1)}</priority>\n` +
        `  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export function renderSitemapIndex(site: string, count: number, lastModified: Date): string {
  const items = Array.from(
    { length: count },
    (_, id) =>
      `  <sitemap>\n    <loc>${site}/sitemap/${id}.xml</loc>\n` +
      `    <lastmod>${lastModified.toISOString()}</lastmod>\n  </sitemap>`,
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>`;
}
