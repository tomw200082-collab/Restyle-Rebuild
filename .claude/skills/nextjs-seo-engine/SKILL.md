---
name: nextjs-seo-engine
description: Use for any Restyle routing, metadata or indexing work — adding a route, writing generateMetadata, building sitemap.xml or robots.txt, generating slugs, emitting JSON-LD structured data, choosing ISR revalidate values, wiring revalidateTag/revalidatePath after a mutation, or setting canonical and noindex. Triggers on "route", "metadata", "sitemap", "robots", "slug", "JSON-LD", "structured data", "canonical", "noindex", "ISR", "revalidate", "og:image", "redirect". Carries the Hebrew metadata templates, the Product schema with ILS and UsedCondition, the transliteration spec, the canonical/noindex matrix, and the revalidation map.
---

# Restyle SEO engine

Organic search is the growth thesis, not a polish item. The system being replaced was a client-rendered SPA whose every item lived at `ItemDetails?id=<24-hex>` — no slug, no server HTML, no structured data, and no category, brand or city pages at all. Everything here exists to convert that into indexable surface area.

Treat SEO as a correctness property: a page that renders beautifully but ships the wrong canonical is broken.

## Slugs

Format: `<transliterated-title>-<6-char-suffix>` → `sapa-tlat-moshavim-ikea-k3f9a2`

The suffix is the first 6 characters of the listing's uuid (hex, base36-safe). It makes collisions impossible by construction — two sellers listing "ספה תלת מושבית איקאה" on the same day is the expected case, not an edge case — and it is **stable for the item's lifetime**, because the URL is the asset. A slug is generated once at listing creation and never regenerated, even if the title is edited. `[D-24]`

### Transliteration

Pure letter-by-letter mapping of unvocalised Hebrew produces unreadable slugs (ס־פ־ה → `sph`). The spec is therefore three-stage, in order:

1. **Term dictionary** — the ~120 furniture words that carry the search intent, mapped phonetically: `ספה`→`sapa`, `שולחן`→`shulchan`, `כיסא`/`כסא`→`kise`, `מיטה`→`mita`, `ארון`→`aron`, `שידה`→`shida`, `כורסה`→`kursa`, `מדף`→`madaf`, `ספרייה`→`sifria`, `מנורה`→`menora`, `שטיח`→`shatiach`, `תלת`→`tlat`, `דו`→`du`, `מושבית`/`מושבים`→`moshavim`, `פינתית`→`pinatit`, `אוכל`→`ochel`, `סלון`→`salon`, `עבודה`→`avoda`, `זוגית`→`zugit`, `נפתחת`→`niftachat`, `עץ`→`etz`, `מלא`→`male`, `זכוכית`→`zchuchit`, `עור`→`or`.
2. **Brand dictionary** — `איקאה`→`ikea`, `ביתילי`→`beitili`, `שמרת הזורע`→`shemerat-hazorea`, `עמינח`→`aminach`, `סילון`→`silon`, `הביטאט`→`habitat`. Latin brand names (West Elm, BoConcept) pass through lowercased.
3. **Deterministic fallback** for anything unmatched — strip niqqud, map final forms to their base (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ), then letter-map with light vowel inference: `א`→`a`, `ו`→`o`, `י`→`i` when medial and dropped when a consonant cluster would be unreadable; `צ`→`tz`, `ש`→`sh`, `ח`→`ch`, `כ`→`k`.

Then: lowercase, replace non `[a-z0-9]` with `-`, collapse repeats, trim, cap at 60 characters on a word boundary.

Fallback quality does not affect correctness — the suffix guarantees uniqueness and the router matches on the suffix. Dictionary hits are what make the URL a ranking asset, so **when a new furniture term appears repeatedly in listings, add it to the dictionary**; that is a real content-strategy action, not a code cleanup.

Unit tests are mandatory and must cover: dictionary hit, brand hit, fallback path, final-form letters, niqqud stripping, mixed Hebrew/Latin, length cap, and idempotency (transliterating a slug returns itself).

## Route map, rendering and indexing

| Route | Rendering | Index | Canonical |
|---|---|---|---|
| `/` | ISR 1h | ✅ | self |
| `/catalog` (no filters) | SSR | ✅ | self |
| `/catalog?category=…` (filter with a hub) | SSR | ❌ | the hub (`/category/[slug]`) |
| `/catalog?<one filter, no hub>` | SSR | ❌ | `/catalog` |
| `/catalog?<2+ filters>` | SSR | ❌ noindex,nofollow | `/catalog` |
| `/item/[slug]` | ISR 60s + on-demand | ✅ **including sold** | self |
| `/category/[slug]` | ISR 1h | ✅ | self |
| `/category/[slug]/[city]` | ISR 1h | ✅ if ≥3 active, else ❌ | self |
| `/brand/[slug]` | ISR 1h | ✅ if ≥3 active, else ❌ | self |
| `/sell`, `/how-it-works`, `/buyer-protection`, legal | static | ✅ | self |
| `/dashboard/*`, `/admin/*`, `/checkout/*`, `/pay/*` | dynamic | ❌ noindex,nofollow | — |

**Sold items stay 200 forever.** A sold listing keeps its URL, shows a `נמכר` state, and renders a similar-items grid. It has accumulated whatever authority it has; 404-ing it throws that away and sends a bounce signal. This is the single highest-leverage SEO decision in the product.

**The ≥3 threshold** on city and brand pages exists because a programmatic page with one item is a thin-content page, and a few hundred of them is a sitewide quality problem, not a few weak URLs.

**Filtered catalogue URLs are never indexed.** Facet combinatorics generate unbounded near-duplicate pages; the hubs are the indexable surface. Emit `robots: { index: false, follow: false }` on multi-filter and `alternates.canonical` on every variant.

## Metadata templates

`metadataBase` is set once in the root layout from `NEXT_PUBLIC_SITE_URL`; without it every OG and canonical URL ships relative and breaks in production.

Root template: `title.template = '%s | Restyle'`, `title.default = 'Restyle — רהיטים יד שנייה בגוש דן'`.

| Route | Title | Description |
|---|---|---|
| `/` | `Restyle — רהיטים יד שנייה איכותיים בגוש דן` | `רהיטים יד שנייה נבחרים, עם הובלה עד הבית ותשלום מאובטח. ספות, שולחנות, ארונות ועוד — בתל אביב, רמת גן והסביבה.` |
| `/item/[slug]` | `{title} — {condition} ב{city}` | `{title} למכירה ב{city}. {condition}, {w}×{d}×{h} ס"מ. ₪{price} כולל אפשרות הובלה עד הבית ותשלום מאובטח.` |
| `/category/[slug]` | `{category} יד שנייה בגוש דן` | `{n} {category} יד שנייה למכירה בגוש דן. הובלה עד הבית, תשלום מאובטח ו-48 שעות לבדוק שהכל תקין.` |
| `/category/[slug]/[city]` | `{category} יד שנייה ב{city}` | `{category} יד שנייה למכירה ב{city}. פריטים נבחרים עם הובלה עד הבית ותשלום מאובטח.` |
| `/brand/[slug]` | `{brand} יד שנייה — רהיטים למכירה` | `רהיטי {brand} יד שנייה בגוש דן. {n} פריטים זמינים עם הובלה ותשלום מאובטח.` |
| `/sell` | `מכירת רהיטים יד שנייה — פרסום חינם` | `מפרסמים חינם, אנחנו מביאים קונה ואוספים מהבית. התשלום מועבר אליכם אחרי המסירה.` |

Rules: titles under 60 characters *rendered*, descriptions 140–160. Hebrew is denser than English per character, so a 60-character Hebrew title carries noticeably more meaning — use it. Never pad with the brand name; the template already appends it. Never generate a description from truncated body text.

`og:image` is the item's cover photo at 1200×630. `/item/[slug]/opengraph-image.tsx` composes a dynamic OG card (photo, title, price) with `ImageResponse`.

## Structured data

Emit as `<script type="application/ld+json">` from a server component. Never `dangerouslySetInnerHTML` with unescaped values — serialise with `JSON.stringify` and escape `<`.

**Product** on every item page:

```jsonc
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "<title>",
  "description": "<description, plain text>",
  "image": ["<absolute photo URLs>"],
  "brand": { "@type": "Brand", "name": "<brand>" },      // omit if unknown
  "category": "<category name_he>",
  "itemCondition": "https://schema.org/UsedCondition",
  "offers": {
    "@type": "Offer",
    "url": "<absolute canonical>",
    "price": "1100.00",                                   // agorot / 100, 2dp, string
    "priceCurrency": "ILS",
    "availability": "https://schema.org/InStock",         // SoldOut when sold
    "itemCondition": "https://schema.org/UsedCondition",
    "seller": { "@type": "Organization", "name": "Restyle" }
  }
}
```

- `priceCurrency` is **ILS**, always. `price` is a decimal string derived from agorot — never a formatted `₪1,100`, which Google rejects.
- `availability`: `InStock` for `active`, `SoldOut` for `sold`, `InStock` for `reserved` (it is still purchasable by others until capture — `[D-15]`).
- `itemCondition` is `UsedCondition` for every listing. schema.org has no gradation matching our four-value scale, and claiming `NewCondition` on second-hand goods is a policy violation.
- `seller` is Restyle, not the individual — the platform is the merchant of record.

**BreadcrumbList** on item, category and brand pages, ordered outermost-first. In RTL the *visual* order flips but the JSON-LD `position` values do not — they are semantic.

**Organization** + **WebSite** with `SearchAction` on the root layout only.

A validation script (`scripts/validate-jsonld.ts`) parses every `application/ld+json` block on seeded pages and asserts required fields. It runs in Gate 5. Broken structured data fails silently in production forever otherwise.

## Revalidation

ISR without on-demand invalidation means a seller edits a price and sees the old one for an hour. Tag every cached read, then invalidate by tag on mutation.

Tags: `listings` (any collection) · `listing:<id>` · `category:<slug>` · `brand:<slug>` · `city:<city>` · `sitemap`

| Mutation | Revalidate |
|---|---|
| listing approved (→ `active`) | `listings`, `listing:<id>`, `category:<slug>`, `brand:<slug>`, `city:<city>`, `sitemap` |
| listing edited | `listing:<id>`, `listings` |
| listing sold / reserved / expired / removed | `listing:<id>`, `listings`, `category:<slug>`, `city:<city>`, `sitemap` |
| order completed | `listing:<id>` |
| category or brand renamed | `sitemap` + that hub's tag |
| `site_config` fee change | `listings` (delivery estimates are rendered) |

Put the tag→mutation mapping in **one** module (`src/lib/cache/tags.ts`), and the invalidation calls in one more (`src/lib/cache/invalidate.ts`). Never scatter `revalidateTag` through server actions — a missed tag is invisible until a user reports stale data.

**Next 16 split invalidation into two functions with different guarantees, and picking the wrong one is a silent staleness bug:**

| Function | Where | Guarantee |
|---|---|---|
| `updateTag(tag)` | Server Actions **only** | expires immediately → read-your-own-writes, so a seller who edits a price sees the new one |
| `revalidateTag(tag, profile)` | route handlers, webhooks, cron | marks stale for the next request; the second argument (a `cacheLife` profile such as `'max'`) is now **required** |

Hence `invalidateFromAction()` and `invalidateFromRoute()` — callers say what happened, the module picks the tags and the mechanism.

## Infrastructure checklist

- **The sitemap is route handlers, not the `sitemap.ts` metadata convention.** That convention has no index form: adding `generateSitemaps` moves the output to `/sitemap/<id>.xml` and leaves **`/sitemap.xml` returning 404** — the one URL robots.txt, Search Console and every crawler try first, failing silently because nothing in the app ever requests it. So: `app/sitemap.xml/route.ts` renders the index, `app/sitemap/[chunk]/route.ts` renders each chunk, and the rendering itself lives in an import-free module so it is unit testable without dragging `server-only` into the test runner. Content: all `active`+`sold` items, categories, brands, qualifying category×city pages, static pages, split at 45,000 URLs (the hard limit is 50,000 and programmatic pages grow fast).
- **`next build` reuses `.next/cache/fetch-cache` across builds.** Catalogue reads go through `fetch` with an explicit `revalidate`, so after a database reset the next build happily prerenders the *old* catalogue — pages for listings that no longer exist, with 404ing images, from a database that plainly does not contain them, and nothing in the build output says so. `npm run db:reset` clears it; clear it by hand after any out-of-band data change.
- **A route that can `notFound()` must not have a route-level `loading.tsx`.** The loading file opens a Suspense boundary around the whole page, so Next begins streaming, the status is committed to **200**, and a later `notFound()` can only inject a `noindex` meta tag — a soft 404 that renders correctly, reports success, and gets indexed as real content. `/item/[slug]`, `/category/[slug]`, `/category/[slug]/[city]` and `/brand/[slug]` therefore have no `loading.tsx`; they are prerendered anyway, so the only request that would ever see a skeleton is an unknown slug, which is precisely the request that needs a real 404. `/catalog`, `/dashboard` and `/admin` may have one: they render an empty state or redirect, and never call `notFound()`. If a slug route ever does need streaming, the existence check goes **before** the boundary and only the slow part goes inside it.
- `robots.ts` disallows `/admin`, `/dashboard`, `/checkout`, `/pay`, `/api`; points at the sitemap.
- **Legacy redirects** are 301s in `middleware.ts`, reading a `legacy_redirects` table (24-char hex legacy id → new slug). Match **case-insensitively** — legacy routing resolved both `/ItemDetails` and `/itemdetails`, so both are in the wild `[D-42]`. Cover every path that appears in already-sent emails: `/ItemDetails?id=`, `/Catalog`, `/BuyerDashboard`, `/SellerDashboard`, `/UploadItem`, `/OrderSuccess?orderId=`, `/SellerResponse`, `/BuyerResponse`, `/AdminV2`. Unmapped legacy ids 301 to `/catalog`, never to a 404.
- `next/image` everywhere, with `sizes` on every grid image.
- Fonts via `next/font/google` with the `hebrew` subset and `display: 'swap'`.
- `lang="he" dir="rtl"` on `<html>`.
- Lighthouse mobile ≥90 for Performance and SEO on `/`, one item page, one category page — recorded in PROGRESS.md.

## The gate asserts what this skill promises

Anything here that can be checked mechanically is a `restyle-release-gate`
stage, because a rule that is only written down is a rule that drifts.

- **`status-codes`** hits every public route and asserts its status. Expected
  status is read from each page's own source — a page calling `requireUser`
  should 307 to login, and that is correct behaviour, not a defect. It also
  asserts that an unknown slug **actually 404s**: a catch-all rendering a
  friendly page for anything is the soft-404 class wearing the other face.
- **`sitemap-coverage`** checks both directions — every indexable route is in
  the sitemap, and every sitemap URL returns 200. A missing entry is lost
  traffic; a dead entry is a crawl error. They are different failures.
- **`sold-200`** proves a sold item still returns 200. `[D-33]`
- **`lighthouse`** enforces perf ≥ 90, SEO = 100, a11y ≥ 95 on home, category
  and item.

**Hub thresholds live here, not in the gate.** Brand hubs and category×city
hubs enter the sitemap only above `MIN_ITEMS_FOR_HUB` active items, and go
`noindex` below it. `sitemap-data.ts` owns that rule; the gate audits those
routes for their status code and treats the sitemap as the authority on
membership. Re-deriving the threshold in the gate would be a second copy of a
policy — the drift class again.

**Below-threshold pages stay reachable and stay 200.** They are `noindex,
follow`: the links out of them still carry weight. A thin page is a quality
problem, not a routing one, and 404ing it would throw away a real URL.
