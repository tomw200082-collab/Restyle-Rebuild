# Over-build traps — the Run 1 evidence

Each trap below was proposed, half-built, or explicitly ruled out during Run 1.
They are recorded with what actually happened so the next session does not have
to re-derive the answer, and so the ladder in `SKILL.md` has receipts.

---

## 1. The date picker that was not needed

**Tempted:** a `<DeliveryWindowPicker>` component — calendar grid, disabled
past dates, RTL-aware month navigation, shift selection. Two or three hundred
lines, or a dependency.

**What shipped:** `<input type="date">` plus a `<select>` over the
`delivery_shift` enum (`morning` | `afternoon` | `evening`).

**Why it wins on a Hebrew RTL mobile-first product specifically:**

- The native control already renders in `he-IL` with Hebrew month names and the
  correct week start, because the browser reads the document locale.
- RTL is handled by the platform. A hand-built grid must mirror its own
  navigation arrows — the exact class of bug `hebrew-rtl-ui` exists to prevent.
- On mobile — the majority of this traffic — the OS date wheel is what users
  already know, and it is accessible for free.
- Min/max are one attribute each, so "no past dates" is not code.

**The rung:** 5, native platform feature. It beat rungs 6 and 7 outright.

---

## 2. `tailwind-merge` — the dependency that was right, and still cost the most

This one is not "don't add dependencies". `tailwind-merge` is genuinely
necessary: without it, a `className` prop cannot override a component's own
utility classes and every variant needs a bespoke escape hatch.

**What it cost anyway:** it classified the project's custom `text-body-sm`
font-size utility as a **colour** utility, so it treated `text-white` as a
conflicting earlier value and dropped it. Every primary and danger button in the
product rendered dark text on clay, from the day the design system landed until
a contrast audit found it. `[D-51]`

**The lesson is not "avoid dependencies".** It is:

> A dependency's failure mode is not your failure mode. This one did not throw,
> did not warn, and produced output that was legible enough to look intentional.

**What it changed:** `CLAUDE.md` invariant 8 — interactive elements assert
**computed** contrast, in a browser. A class-list assertion would have passed,
because the class list was correct right up until the merge ran.

**The rule it produced:** every new dependency gets a `docs/DECISIONS.md` entry
naming its rejected alternatives *and* the thing you would notice if it failed
silently.

---

## 3. Chat — out of scope, and load-bearing that it stays out

**Tempted:** buyer–seller messaging. Every marketplace has it, so its absence
reads like an omission.

**Why it is not:**

- Restyle holds the money. A conversation the platform cannot see is a
  conversation it cannot arbitrate — and it *will* be asked to, at the first
  dispute where one side says "he told me it had a scratch".
- It moves the platform off-platform: the first exchanged phone number is a
  sale that pays no commission and carries no protection. The legacy platform
  leaked exactly this way.
- The information a buyer actually needs — condition, dimensions, photos,
  pickup city, floor, lift — is **required listing data**. Chat would mostly be
  a slower path to fields that are already on the page.

**What replaces it:** the order timeline, sixteen Hebrew email templates, and
the dispute console. Every one of those is auditable in `order_events` or
`outbound_events`; a chat log would be a fourth store of truth.

---

## 4. Reviews and ratings — out of scope

**Tempted:** seller ratings, buyer ratings, five stars, a review queue.

**Why not:** furniture resale is *low-frequency*. A typical seller lists once or
twice, ever. A ratings system on that distribution produces profiles reading
"0 reviews" or "1 review — ★★★★★", which is worse than no signal: it invites the
buyer to weigh a number that means nothing.

**What replaces it:** the buyer protection window, the inspection step at
pickup, and admin approval of every listing before it goes live. Trust is
provided by the platform, not crowdsourced from a thin sample.

---

## 5. No state-management library

**Tempted:** the catalogue has filters, sort, pagination, a favourites toggle
and a delivery estimator. That reads like "we need a store".

**What shipped:** three categories of state, each with an obvious home.

| state | lives in | why |
|---|---|---|
| Catalogue filters, sort, page | **URL** (`URLSearchParams`) | Shareable, back-button-correct, indexable, and survives a refresh. A store gives up all four. |
| Everything from the database | **Server Components** | It never enters client state, so it cannot go stale. |
| Open/closed, in-flight, form drafts | **`useState`** | Local by definition. |

There is no fourth category. A store would be a cache in front of a cache, and
it would make routes dynamic — which deletes ISR, which is the whole SEO
strategy. `[D-46]`

---

## 6. No image-processing pipeline

**Tempted:** a queue, a resize worker, variant generation, a CDN abstraction.

**What exists already:** client-side compression in the sell wizard (the upload
is smaller before it leaves the phone, which is what actually matters on Israeli
mobile data), `next/image` for responsive delivery, Supabase Storage for
serving, and `sharp` — already a dependency — for the OG images that need
server rendering.

A pipeline would add operational surface (a queue to monitor, a worker to
deploy, a failure mode where a listing has no photos) to solve a problem four
existing pieces already solve.

---

## 7. The generic repository layer

**Tempted:** `Repository<T>` with `findById`, `findAll`, `create`, `update`, so
`src/lib/db/` is "consistent".

**Why not:** supabase-js *is* the query builder, and the generated
`Database` type already gives full type safety per table. A generic layer over
it can only subtract — it loses PostgREST's embedded resource syntax
(`select('*, seller:profiles(...)')`), which is how half the product's reads
avoid an N+1.

Worse, it hides which client you are on. There are three, deliberately:

| client | RLS | used by |
|---|---|---|
| public / anon, cookie-free | enforced | public pages — cookie-free so routes stay static `[D-46]` |
| server, cookie-aware | enforced as the signed-in user | dashboards, actions |
| service role | **bypassed entirely** | seeds, cron, admin paths — each doing its own authz check `[D-28]` |

A wrapper that makes those look alike is a security defect waiting for the first
maintainer who does not know there were three.

---

## 8. The second sitemap mechanism — an over-build that shipped and 404'd

Next's `generateSitemaps` produces `/sitemap/<id>.xml` and **no index file**.
Run 1 used it, which meant `/sitemap.xml` — the single URL `robots.txt` points
at, and the first one every crawler requests — returned 404. `[D-49]`

The framework feature was doing more than was needed (chunking a catalogue far
smaller than the 50,000-URL limit) and, in doing so, moved the one URL that
mattered.

**Fixed by:** an explicit `/sitemap.xml` route that serves a real index, with
the chunks behind it.

**The trap named:** reaching for a framework feature because it exists, rather
than because the problem is present. Chunking was speculative; the 404 was real.

---

## The pattern across all eight

Six of these are things not built. Two — `tailwind-merge` and
`generateSitemaps` — are things that *were* built and failed **silently**: no
throw, no warning, output that looked fine.

That is the through-line of this whole codebase's defect history, and it is why
the ladder's rungs 3–5 (Postgres, stdlib, platform) rank above "write it
yourself" and far above "add a dependency". The fewer moving parts between an
intention and its effect, the fewer places a failure can hide without
announcing itself.
