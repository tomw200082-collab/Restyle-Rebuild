---
name: restyle-root-cause-debug
description: Use for any Restyle bug, test failure, flaky test, unexpected behaviour, empty page, wrong number, or gate failure — before proposing any fix. Triggers on "bug", "broken", "failing", "flaky", "doesn't work", "empty page", "no rows", "wrong total", "404", "500", "why is", "debug", "investigate". Enforces no fix without a reproduction, carries the soft-404 and tailwind-merge incidents as case studies in silent failure, and requires the sibling question — what else fails silently in this class?
---

# Restyle root-cause debugging

Adapted from `superpowers:systematic-debugging`. The iron law is kept verbatim.
What is added is the reason this codebase needs it more than most: **its
expensive bugs did not throw.** An empty page instead of an error, a 200 instead
of a 404, a legible wrong colour, a working endpoint that should not exist. A
debugging method built around reading stack traces would have found none of
them.

## The iron law

```
NO FIX WITHOUT A REPRODUCTION FIRST
```

A reproduction is a command, a test, a URL, or a query that **fails now** and
will **pass after the fix**. Not a description of the failure — the failing
thing itself. If you cannot produce one, you do not yet know what is broken, and
a fix is a guess that will need its own debugging session.

Applies hardest when it is least welcome: under time pressure, when the fix is
"obvious", when you have already tried two things, and when the issue looks too
simple to have a root cause.

## Phase 1 — investigate

1. **Read the whole error.** Stack trace to the bottom. PostgREST error bodies
   name the policy or the column.
2. **Reproduce it deterministically.** Smallest input that shows it. Write it
   down before touching anything.
3. **Find the actual mechanism.** Not "the query returns nothing" but "the RLS
   policy on `listings` evaluates `auth.uid()` as null because the request used
   the cookie-free client".
4. **Grep every caller** of the function you are about to change. The lazy fix
   *is* the root-cause fix: one guard in the shared function is a smaller diff
   than a guard in each caller — and patching only the path the report names
   leaves every sibling caller broken.
5. **Ask when it started.** `git log -S'<the string>'` and `git bisect` are
   cheap. "Wrong since the design system landed" was the answer for the
   contrast bug and it reframed the whole investigation.

## Phase 2 — the sibling question

> **What else fails silently in this class?**

Ask it every time, before writing the fix. It is the highest-value question in
this document, and it is what turned a single 404 into a status-code assertion
over every public route.

The classes this codebase has already produced:

| class | ask |
|---|---|
| Wrong HTTP status, successful render | Which other routes could 404, 500 or 30x without anything noticing? |
| Dependency transforms output silently | What else does that library touch? Every button, or just this one? |
| Two writers to one dataset | What else does the seed write that a human also edits? |
| Belief instead of measurement | What else is "obviously in sync" and has never been diffed? |
| Swallowed error, empty render | Which other reads discard `error`? |
| Missing grant / over-broad grant | Which other function or column has default privileges? |

## Phase 3 — fix

1. Write the failing test **first**. It must fail on current code, for the right
   reason. A regression test that passes before the fix is testing something
   else.
2. Fix the mechanism, not the symptom.
3. Watch the test go green.
4. Run the neighbours — `npm run verify`, and the e2e spec covering the flow.

## Phase 4 — backprop

`restyle-spec-discipline`, same PR: the `SPEC.md` invariant, the regression
test, and — if the class is new and mechanically checkable — a
`scripts/release-gate.ts` stage.

---

## Case study 1 — the soft-404 that nothing requested

**Symptom:** none. Nothing failed. Found by an auditor asking what
`robots.txt` points at.

**Mechanism:** Next's `generateSitemaps` relocates output to
`/sitemap/<id>.xml` and publishes **no index file**. `robots.txt` pointed at
`/sitemap.xml`, which therefore 404'd. Nothing in the application ever requests
that URL — only crawlers do, and crawlers do not file bug reports. `[D-49]`

**Why the tests missed it:** the SEO spec asserted that sitemap content was
correct — by fetching a chunk URL directly. Every assertion passed. The URL that
mattered was never requested by anything under test.

**The class:** *an HTTP response that is wrong but not an error.* A test
asserting on rendered text passes against a soft-404, because a soft-404 renders.

**What it produced:** an explicit `/sitemap.xml` route serving a real index;
`SPEC.md` invariant "public routes assert real status codes"; a gate stage that
asserts the status code of every public route; the `route-auditor` subagent.

**Transferable lesson:** *test the URL the outside world uses, not the URL your
code happens to call.*

---

## Case study 2 — the contrast bug that shipped on day one

**Symptom:** none reported. Every primary and danger button had rendered dark
text on clay since the design system landed. Legible enough to look
intentional. Found by a deliberate contrast audit.

**Mechanism:** `tailwind-merge` classified the project's custom `text-body-sm`
font-size utility as a **colour** utility. Seeing `text-body-sm` and
`text-white` as conflicting values of one group, it kept the last and dropped
`text-white`. `[D-51]`

**Why the tests missed it:** unit tests asserted the class list, which was
correct *before* the merge ran. Playwright asserted the button's text and its
click behaviour, both fine. Nothing measured the pixel that a human sees.

**The class:** *a dependency that transforms your output and never says so.*
No throw, no warning, plausible output.

**What it produced:** `SPEC.md` invariant "interactive elements assert computed
contrast"; a gate stage measuring **computed** colour in a real browser against
WCAG AA; the dependency rule in `restyle-yagni` — every new dependency names
what you would notice if it failed silently.

**Transferable lesson:** *assert the output, not the input.* The class list is
the input. The rendered colour is the output.

---

## Restyle-specific first checks

Before a deep dive, these explain a large share of local failures:

| Symptom | Check first |
|---|---|
| Page renders empty, no error | A Supabase read discarding `error`. `[D-47]` |
| "No rows" from a valid-looking query | Stale PostgREST schema cache — `notify pgrst, 'reload schema'`. An unknown embed hint returns an error the client renders as no rows |
| RLS denies a legitimate read | Which client? Cookie-free anon has no `auth.uid()`. `[D-46]` |
| Money off by a few agorot | Somewhere reconstructed payout instead of subtracting. `[D-10]` |
| A transition "does nothing" | It is not in the transition table. That is the feature |
| e2e passes twice, fails on the third | A poll reading one field of a multi-write action. Poll the terminal state as a whole. `[D-60]` |
| Route went dynamic, ISR gone | Something in the tree reads cookies. `[D-46]` |
| Lighthouse suddenly worse | Stray `next-server` serving a deleted build (`pgrep -af next-server`), or e2e fixture listings with 404 photos — `npm run db:reset` |
| A `SECURITY DEFINER` function callable by anon | `EXECUTE` is granted to `PUBLIC` by default. `[D-44]` |

## Flaky tests are bugs

A test that passes twice and fails on the third is not noise, it is a race you
have not found yet — usually in the **product**, occasionally in the test. Run 1's
one instance was in the test: it polled `status` on an order whose
`refund_agorot` was written a moment later, so it could read a true status and a
stale refund. The fix was to poll the terminal state as a whole; no product code
changed. `[D-60]`

Never retry a flaky test into green. Find the write ordering it exposed.
