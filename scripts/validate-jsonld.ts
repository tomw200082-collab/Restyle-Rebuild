/**
 * Structured-data validator.
 *
 * Broken JSON-LD fails silently: Google ignores the block, the page still
 * renders, and nothing in the app ever notices. This fetches the running site,
 * parses every `application/ld+json` block, and asserts the fields that
 * actually matter for rich results.
 *
 *   npx tsx scripts/validate-jsonld.ts [baseUrl]
 */
const BASE = (process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100').replace(
  /\/$/,
  '',
);

type Block = Record<string, unknown>;

const failures: string[] = [];
const fail = (path: string, message: string) => failures.push(`${path}: ${message}`);

async function blocksOn(path: string): Promise<Block[]> {
  const response = await fetch(`${BASE}${path}`, { redirect: 'follow' });
  if (!response.ok) {
    fail(path, `HTTP ${response.status}`);
    return [];
  }

  const html = await response.text();
  const matches = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ];

  const out: Block[] = [];
  for (const [, raw] of matches) {
    try {
      // The renderer escapes `<` as <; JSON.parse handles that natively.
      const parsed = JSON.parse(raw!) as unknown;
      if (Array.isArray(parsed)) out.push(...(parsed as Block[]));
      else out.push(parsed as Block);
    } catch (err) {
      fail(path, `unparseable JSON-LD: ${err instanceof Error ? err.message : err}`);
    }
  }
  return out;
}

const typeOf = (block: Block) => String(block['@type'] ?? '');
const find = (blocks: Block[], type: string) => blocks.find((b) => typeOf(b) === type);

function require_(path: string, block: Block | undefined, type: string, fields: string[]) {
  if (!block) {
    fail(path, `no ${type} block`);
    return;
  }
  for (const field of fields) {
    const value = field.split('.').reduce<unknown>(
      (acc, key) => (acc && typeof acc === 'object' ? (acc as Block)[key] : undefined),
      block,
    );
    if (value === undefined || value === null || value === '') {
      fail(path, `${type} is missing ${field}`);
    }
  }
}

async function main() {
  console.log(`Validating structured data on ${BASE}\n`);

  // -- Site-wide entities, emitted from the root layout -------------------
  const home = await blocksOn('/');
  require_('/', find(home, 'Organization'), 'Organization', ['name', 'url', 'logo']);
  require_('/', find(home, 'WebSite'), 'WebSite', ['name', 'url', 'potentialAction.target']);

  // -- One item page ------------------------------------------------------
  const catalogHtml = await (await fetch(`${BASE}/catalog`)).text();
  const itemPath = /href="(\/item\/[^"]+)"/.exec(catalogHtml)?.[1];

  if (!itemPath) {
    fail('/catalog', 'no item link found — cannot validate a Product block');
  } else {
    const item = await blocksOn(itemPath);
    const product = find(item, 'Product');
    require_(itemPath, product, 'Product', [
      'name',
      'itemCondition',
      'offers.price',
      'offers.priceCurrency',
      'offers.availability',
      'offers.url',
    ]);

    const offers = (product?.offers ?? {}) as Block;
    if (offers.priceCurrency !== 'ILS') {
      fail(itemPath, `priceCurrency is ${String(offers.priceCurrency)}, expected ILS`);
    }
    // Google rejects a formatted price outright, and he-IL formatting emits
    // directional marks that are invisible in a diff.
    if (typeof offers.price !== 'string' || !/^\d+\.\d{2}$/.test(offers.price)) {
      fail(itemPath, `price is ${JSON.stringify(offers.price)}, expected a "0.00" decimal string`);
    }
    if (product?.itemCondition !== 'https://schema.org/UsedCondition') {
      fail(itemPath, `itemCondition is ${String(product?.itemCondition)}, expected UsedCondition`);
    }

    const crumbs = find(item, 'BreadcrumbList');
    require_(itemPath, crumbs, 'BreadcrumbList', ['itemListElement']);
    const elements = (crumbs?.itemListElement ?? []) as Block[];
    elements.forEach((element, index) => {
      if (element.position !== index + 1) {
        fail(itemPath, `breadcrumb ${index} has position ${String(element.position)}`);
      }
      if (!element.item) fail(itemPath, `breadcrumb ${index} has no item URL`);
    });
  }

  // -- One category page --------------------------------------------------
  const homeHtml = await (await fetch(`${BASE}/`)).text();
  const categoryPath = /href="(\/category\/[^"/]+)"/.exec(homeHtml)?.[1] ?? '/category/sofas-armchairs';
  const category = await blocksOn(categoryPath);
  require_(categoryPath, find(category, 'BreadcrumbList'), 'BreadcrumbList', ['itemListElement']);
  require_(categoryPath, find(category, 'ItemList'), 'ItemList', ['name', 'numberOfItems']);

  // -- FAQ ----------------------------------------------------------------
  const faq = await blocksOn('/how-it-works');
  const faqPage = find(faq, 'FAQPage');
  require_('/how-it-works', faqPage, 'FAQPage', ['mainEntity']);
  for (const question of ((faqPage?.mainEntity ?? []) as Block[])) {
    const answer = (question.acceptedAnswer ?? {}) as Block;
    if (!question.name || !answer.text) fail('/how-it-works', 'FAQ entry missing name or answer');
    // Markdown emphasis in a JSON-LD answer is rendered literally in results.
    if (typeof answer.text === 'string' && answer.text.includes('**')) {
      fail('/how-it-works', 'FAQ answer contains raw markdown emphasis');
    }
  }

  // -- robots and sitemap -------------------------------------------------
  const robots = await fetch(`${BASE}/robots.txt`);
  const robotsBody = await robots.text();
  if (!robotsBody.includes('Sitemap:')) fail('/robots.txt', 'no Sitemap directive');
  for (const path of ['/admin', '/dashboard', '/checkout']) {
    if (!robotsBody.includes(`Disallow: ${path}`)) fail('/robots.txt', `${path} is not disallowed`);
  }

  const sitemap = await fetch(`${BASE}/sitemap.xml`);
  const sitemapBody = await sitemap.text();
  if (!sitemap.ok) fail('/sitemap.xml', `HTTP ${sitemap.status}`);
  else if (!sitemapBody.includes('<urlset') && !sitemapBody.includes('<sitemapindex')) {
    fail('/sitemap.xml', 'is neither a urlset nor a sitemap index');
  }

  if (failures.length) {
    console.error(`${failures.length} structured-data problem(s):\n`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }

  console.log('Structured data: all assertions passed.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
