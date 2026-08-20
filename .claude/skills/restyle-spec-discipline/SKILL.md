---
name: restyle-spec-discipline
description: Use whenever a bug is fixed, a gate fails, a regression is found, an invariant changes, or SPEC.md needs updating — and at the end of any PR that fixes something that escaped. Triggers on "bug", "regression", "fix", "gate failed", "broke", "postmortem", "invariant", "SPEC.md", "backprop", "why did this ship", "add a test for". Carries the backprop rule that no fix merges without both a SPEC.md invariant and a regression test, the invariant-writing format, and what belongs in SPEC.md versus what does not.
---

# Restyle spec discipline

The lineage here is caveman/cavekit, and the adopted essence is **spec survival
and backprop** — not prose compression. Compressing English saves tokens;
surviving a context reset saves the product. Only one of those was worth taking.

Two mechanisms:

1. **`SPEC.md` is the compressed living truth.** A fresh session that reads only
   `SPEC.md` must be unable to violate the product.
2. **Backprop.** Every bug that reaches `main` or fails a gate becomes, *in the
   same PR as its fix*, both a `SPEC.md` invariant and a regression test.

## The backprop rule

> **No fix merges without both.**

| Escaped bug produces | Where |
|---|---|
| An **invariant** — the rule that, had it been stated, would have made the bug obviously wrong | `SPEC.md` |
| A **regression test** — the assertion that fails on the old code and passes on the new | `tests/` |
| *(if the class is new)* a **gate stage** | `scripts/release-gate.ts` |

A fix without a test will regress. A fix with a test but no invariant will be
re-argued by the next session, which does not have the incident in context and
will see only a strange-looking assertion. The test stops the same bug; the
invariant stops the *class*.

### Definition of "escaped"

- reached `main`, or
- was found by a release-gate stage rather than by the test suite, or
- was found by a human reading a diff.

A bug found by a test you wrote five minutes ago, in the loop you are already
in, is TDD working — not an escape. Do not backprop it.

## Writing an invariant

An invariant is a **rule that is checkable and that names its failure**, not a
description of the fix.

❌ "We fixed the sitemap route so it returns the index."
❌ "Be careful with tailwind-merge and colour classes."
❌ "Test more thoroughly."

✅ **Public routes assert real status codes.** A test asserting on rendered text
passes against a soft-404. `[D-49]`

✅ **Interactive elements assert computed contrast**, measured in a browser, not
inferred from a class list. `[D-51]`

The shape: **imperative rule** · **why the obvious approach misses it** ·
**decision reference**.

Three tests for a candidate invariant:

1. **Would it have caught this bug before it shipped?** If it only *describes*
   the bug, it is a changelog entry.
2. **Does it generalise past the instance?** "`/sitemap.xml` must return 200"
   catches one URL. "Public routes assert real status codes" catches the class,
   and it is the class that recurs.
3. **Can it be mechanically checked?** If yes, it also becomes a gate stage. If
   no, it still belongs in `SPEC.md` — a human-checked rule beats an unstated
   one — but say plainly that it is human-checked.

## What belongs in `SPEC.md`

**In:** money rules · both state machines · timings and their published
counterparts · security invariants · rendering/SEO invariants · the named
silent-failure invariants · the L5 list · the out-of-scope list.

**Out:** implementation detail (`SPEC.md` says the fee formula, not which file
holds it) · decision *history* — that is `docs/DECISIONS.md`, and `SPEC.md`
links to it by `[D-NN]` · anything true of every Next.js app · anything the type
system already enforces.

**The size test.** `SPEC.md` earns its place by being read *in full* at the start
of a session. If it grows past roughly 300 lines, something in it is
implementation detail wearing a rule's clothes. Cut before adding — the same
ladder `restyle-yagni` applies to code applies here.

## The procedure, per escaped bug

1. **Reproduce first.** No fix without a reproduction —
   `restyle-root-cause-debug`. The reproduction becomes the regression test.
2. **Name the class.** Not "the sitemap 404'd" but "a route can return a wrong
   status while rendering successfully". Ask the sibling question: *what else
   fails silently in this class?* — that question is what turned one sitemap
   404 into a status-code assertion over every public route.
3. **Write the failing test.** It must fail on the current code. A regression
   test that passes before the fix is testing something else.
4. **Fix it.**
5. **Write the invariant** into `SPEC.md`, in the section it belongs to.
6. **Log the decision** in `docs/DECISIONS.md` if the fix chose between real
   alternatives.
7. **If the class is mechanically checkable and new, add a gate stage** in
   `scripts/release-gate.ts`.
8. **One PR.** Fix, test, invariant, decision. A follow-up PR "to add the test"
   is the thing this rule exists to prevent.

## Keeping `SPEC.md` honest

- **`CLAUDE.md` wins.** If they disagree, `SPEC.md` is wrong; fix it in the same
  PR that noticed.
- **A published number appears in three places** — `site_config`, `SPEC.md`, and
  the Hebrew policy page. Changing one without the others is a defect, not a
  drift. The ₪50 cancellation fee, the 48h protection window and the 7-day
  resale window are all published.
- **A reversed decision is a new entry** referencing the old one, in both
  `SPEC.md` and `docs/DECISIONS.md`. Nothing is edited into silence.
- **`regression-sentinel`** reads a diff and reports which invariants it touches
  and which tests are missing. Run it before opening a PR that touches money,
  state or a public route.

## The two founding invariants

Seeded from Run 1 because they cost the most and neither threw:

**Public routes assert real status codes.** `/sitemap.xml` returned 404 — the
one URL `robots.txt` points at and every crawler tries first. `generateSitemaps`
relocates output to `/sitemap/<id>.xml` and publishes no index. Nothing in the
application requests that URL, so nothing failed. `[D-49]`

**Interactive elements assert computed contrast.** `tailwind-merge` classified
the custom `text-body-sm` font-size utility as a colour utility and dropped
`text-white` from the merge. Every primary and danger button rendered dark on
clay from the day the design system landed. It was legible enough not to look
broken. `[D-51]`

Both are now gate stages. That is what backprop is for.
