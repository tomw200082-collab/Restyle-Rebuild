# SEO audit

_2026-08-20 · `seo-auditor` · origin http://127.0.0.1:3210 · target `vntihvctqueohwprafwh` (production)_

19 public routes, 21 sitemap URLs, 12 categories, 12 brands, 0 listings.

## Findings

### 1. `/` had no canonical — fixed in this tranche

The site's highest-authority URL shipped with no `<link rel="canonical">` at
all. The home page inherits its title and description from the root layout, and
a canonical is the one piece of metadata that **must not** be inherited: a
layout-level `alternates.canonical` is picked up by every page that does not
override it, so all of them would claim `/`.

The result was that any variant serving the home page — `/?utm_source=…`, a
trailing slash, an alternate host — could be indexed as a separate URL and split
its authority.

- **Fixed:** `src/app/page.tsx` now exports `alternates: { canonical: '/' }`.
- **Regression test:** `tests/e2e/seo.spec.ts` → "the home page is canonical to
  itself".
- **Invariant:** `SPEC.md` §6 — canonicals are set on the page, never on a
  layout. `[D-67]`
- **Verified:** `curl -s / | grep canonical` → `<link rel="canonical" href="…"/>`,
  and `quality/route-audit.md` now reports 19/19 clean.

### 2. Nothing else outstanding

| check | result |
|---|---|
| One self-referencing canonical per indexable page | ✅ 17/17 indexable pages |
| `noindex` pages carry no contradictory canonical | ✅ `/sell/new/submitted` |
| Auth-gated pages never indexable | ✅ `/sell/new` 307s, absent from sitemap |
| `/sitemap.xml` is a real index at that exact URL | ✅ 200, 1 chunk, 21 URLs `[D-49]` |
| Every sitemap URL returns 200 | ✅ 21/21 |
| Every indexable route present in the sitemap | ✅ 11/11 |
| Category slugs resolve | ✅ 12/12 → 200 |
| Brand slugs resolve | ✅ 12/12 → 200 |
| Unknown category / item slug 404s | ✅ both |
| JSON-LD per template | ✅ `Organization` + `WebSite` sitewide, `FAQPage` on `/how-it-works`, `ItemList` on hubs |
| Hebrew titles and descriptions | ✅ 17/17 |

## Threshold behaviour — verified as correct, not merely observed

Brand hubs and category×city hubs enter the sitemap only above
`MIN_ITEMS_FOR_HUB` active items and go `noindex, follow` below it. With **0
listings on the remote**, every hub is below the threshold, so:

- no brand or cat×city URL appears in the sitemap — **correct**;
- every brand hub still returns **200**, `noindex, follow` — **correct**. A thin
  page is a quality problem, not a routing one, and 404ing it would throw away
  a real URL whose outbound links still carry weight;
- `/category/<slug>/<city>` returns **404** for a city with no active listings —
  **correct**: the route resolves its city against cities that have active
  items, so a city with none is genuinely not a page.

The last of those was initially recorded as a gate failure. It was the gate's
route sampler building a URL from `delivery_zones` rather than from a listing;
the application's behaviour was right. Corrected in `scripts/release-gate/
routes.ts` and noted here because a future audit will re-encounter it the moment
the catalogue is empty again.

## Cannot be audited until there is inventory

These are **not** passes. They are unmeasured, and they are the checks that
matter most for organic traffic:

- `Product` JSON-LD on an item page (price, ILS, `UsedCondition`, availability)
- item-page canonical and OG image
- sold-item pages returning 200 with a sold state `[D-33]`
- hub threshold behaviour **above** the threshold
- category×city hubs resolving for a real city
- sitemap membership for items, brands and cat×city pages

P1's demo content makes all six measurable. Until then the release gate reports
them as `skipped(no-listings-in-target-database)`, which is the honest status —
never a pass.

## Legacy redirects — not applicable yet

`legacy_redirects` is 0 rows: the Base44 export has not been delivered.
`middleware.ts` matches case-insensitively `[D-42]` and unmapped ids 301 to
`/catalog`, but there is nothing to redirect. Re-audit after P2.

---

## Verification commands

Every claim above was measured, not inferred. Reproduce with the server on 3210:

```
$ for s in $CATS; do curl -s -o /dev/null -w '%{http_code}' /category/$s; done
  12/12 -> 200
$ for s in $BRANDS; do curl -s -o /dev/null -w '%{http_code}' /brand/$s; done
  12/12 -> 200
$ curl -s /brand/ikea | grep '<meta name="robots"'
  <meta name="robots" content="noindex, follow"/>
$ curl -s -o /dev/null -w '%{http_code}' /category/nope-xyz  -> 404
$ curl -s -o /dev/null -w '%{http_code}' /item/nope-xyz      -> 404
$ curl -s -o /dev/null -w '%{http_code}' /brand/nope-xyz     -> 404
$ curl -s /sitemap.xml   | grep -c '<loc>'  -> 1   (chunks)
$ curl -s /sitemap/0.xml | grep -c '<loc>'  -> 21  (urls)
```

Full per-route table: `quality/route-audit.md`.
