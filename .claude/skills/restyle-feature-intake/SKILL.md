---
name: restyle-feature-intake
description: Use before writing any code for a new Restyle feature, capability or user-facing behaviour — any request that is not a bug fix, a refactor or a documented plan step. Triggers on "can we add", "new feature", "it would be good if", "users want", "add a page", "add a flow", "what if sellers could", "buyers should be able to". Turns a request into a half-page mini-spec — problem, AptDeco precedent, states touched, money impact, rejected alternatives — and stops there for operator approval before any implementation.
---

# Restyle feature intake

Adapted from `superpowers:brainstorming`. The brainstorm→spec shape is taken;
the questions are Restyle's, because a marketplace holding other people's money
has a fixed set of things a new feature can quietly break.

**Output is a mini-spec, not code.** Half a page. Then stop.

## The hard gate

> Do not write implementation code, create files, or run a migration until the
> operator has seen the mini-spec and said yes.

The ceremony scales with the task; **the gate never does.** "Too simple to need
approval" is how out-of-scope features get built. And the fastest way to fail
this gate is to build something already on the `SPEC.md` §10 out-of-scope list —
that is not going the extra mile, it is overruling a decision the operator
already made.

## Classify first, out loud

Say which path you are on so the operator can override it.

- **Question** — "does X already work?" Answer it. Read the code, run the query,
  report. No spec, no code.
- **Bounded** — a well-scoped change to a flow that **already exists in this
  repo**: a new field, a new admin column, a copy change, an extra filter.
  Mini-spec in chat, a few paragraphs. Stop for a yes.
- **New capability** — a flow that does not exist, a new route, a new table, a
  new state, or anything that touches money. Full mini-spec written to
  `docs/specs/<slug>.md`, then `restyle-plan-execute`.

In doubt → the heavier path. The ratchet is one-way: hidden complexity found
mid-task upgrades the path. Nothing downgrades mid-task.

## The mini-spec

```markdown
# <feature> — mini-spec

## Problem
Who is stuck, doing what, today. One paragraph. If it is written from the
solution backwards ("we need a picker"), it is not a problem statement yet.

## Evidence
Is this a real problem or a felt one? Legacy data (`docs/LEGACY_INTELLIGENCE.md`),
a support pattern, an operator observation, a KPI from `brain/`. "It would be
nice" is an honest answer — write it and let the operator weigh it.

## AptDeco precedent
Restyle is deliberately modelled on AptDeco. Does AptDeco do this? How? If they
do not, that is information — they have run this business at scale for a decade.
"No precedent" does not veto, but it must be said.

## States touched
- **Order states:** which of the nine, and does any legal transition change?
- **Listing states:** which of the eight?
- **New states?** Adding one means editing a transition table — the highest-risk
  change in the schema. Say so explicitly.

## Money impact
One sentence, in this exact form:
> "<amount> moves from <party> to <party> when <trigger>."
Or: **"No money moves."**
If that sentence is hard to write, the feature is not understood yet. Any
change to fees, commission, refunds or payouts also names its
`EXECUTION_POLICY.md` level.

## Data
New tables or columns? RLS policy for each? Does it touch the seller's street
address (column-privilege territory, `[D-45]`)? Does any public projection grow?

## Surface
New routes? Then: canonical, noindex, sitemap membership, and — if a listing can
reach a terminal state through it — does the page still return 200 when sold?

## Hebrew
The user-visible strings, in Hebrew, in the spec. Not "TBD copy". Copy written
after the fact is copy written by an engineer.

## Rejected alternatives
At least two, with why. Mandatory — this becomes the `docs/DECISIONS.md` entry.
"Do nothing" is always one of the alternatives and sometimes wins.

## Smallest version that delivers the value
Run `restyle-yagni` against your own proposal before showing it. What can be
cut and still solve the problem in the Problem section?
```

## Questions that catch the expensive mistakes

Ask these before writing the spec. Each maps to something that has actually gone
wrong here or on the legacy platform.

1. **What happens when the seller does not respond?** 72% of legacy orders died
   exactly there. Any flow with a seller step needs an answer.
2. **What does the buyer see if this fails halfway?** Restyle holds the money
   during every failure.
3. **Who can read this row?** Every table has RLS. Name the four roles — anon,
   buyer, seller, admin — and what each sees.
4. **Does it make a public route dynamic?** Reading cookies in a public path
   deletes ISR and the SEO strategy with it. `[D-46]`
5. **Is it idempotent?** Cron is at-least-once and users double-tap.
6. **Does it contradict a published policy page?** Terms, Cancellation Policy,
   Buyer Protection are live promises.
7. **What does it look like at 390px in RTL?** That is the majority case, not
   the edge case.

## Then stop

Present the mini-spec. Say plainly: *"This is a spec, not an implementation.
Say go and I will plan it."*

On approval: `restyle-plan-execute` for a new capability, or straight to the
work for a bounded one. Either way the `docs/DECISIONS.md` entry is written from
the **Rejected alternatives** section, in the same PR as the code.
