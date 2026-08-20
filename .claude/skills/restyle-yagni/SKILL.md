---
name: restyle-yagni
description: Use before writing any new Restyle code, adding any dependency, or designing any abstraction — and whenever a change feels like it needs "a system" for it. Triggers on "should I add", "new dependency", "npm install", "library", "abstraction", "helper", "generic", "reusable", "state management", "framework", "picker", "chat", "reviews", "over-engineered", "simplify", "yagni", "do we need". Carries the decision ladder, Restyle's own over-build traps, the out-of-scope list that is a product decision rather than an engineering one, and the /yagni-review diff pass that hunts only over-engineering.
---

# Restyle YAGNI

The ponytail decision ladder, localised to a marketplace that already knows
which over-builds tempt it. Adapted from `ponytail@ponytail` (installed in this
environment); the traps below are Restyle's, not the plugin's.

Lazy means efficient, not careless. The best code is the code never written —
and on this codebase the most expensive code was never the missing kind. It was
the extra kind: a dependency that dropped a class silently, a second sitemap
mechanism nobody requested.

## The ladder

Run it **after** you understand the problem, not instead of understanding it.
Stop at the first rung that holds.

1. **Does this need to exist at all?** Speculative need → skip it, say so in one
   line. Check §"Out of scope" below first: it may already be answered.
2. **Already in this codebase?** Restyle has a fee engine, a slug generator, a
   notification provider, a payment provider interface, a cache-tag map, a
   `site_config` reader with defaults, and a zone lookup. Look before you write.
3. **Does Postgres do it?** This is the Restyle-specific rung and it outranks
   the stdlib one. A CHECK constraint, a transition table, a trigger, a
   generated column or an RLS policy is enforcement; the same rule in TypeScript
   is a convention that the next `service_role` script ignores. Money and state
   belong in the database.
4. **Does the stdlib do it?** `Intl.NumberFormat` for ₪, `Intl.DateTimeFormat`
   for he-IL dates, `URLSearchParams` for filter state, `crypto.randomUUID()`.
5. **Does the platform do it?** `<input type="date">` over a picker library, CSS
   over JS, Server Components over client state, `revalidateTag` over a cache
   abstraction, `next/image` over an image pipeline.
6. **Does an already-installed dependency do it?** Zod, `tailwind-merge`, Radix,
   `sharp`, `lucide-react` are here. Never add a new one for what a few lines do.
7. **Can it be one line?** One line.
8. **Only then:** the minimum code that works.

## Restyle's own over-build traps

These are not hypothetical. Each was either proposed, half-built, or explicitly
ruled out during Run 1. Full write-ups with the run-1 evidence in
`references/overbuild-traps.md`.

| Tempted to build | Don't | Instead |
|---|---|---|
| A date/time picker component for delivery windows | Native `<input type="date">` handles he-IL, RTL, and mobile keyboards for free — and correctly | Native input + the three `delivery_shift` enum values |
| Buyer–seller chat | Out of scope **by spec**. It also makes Restyle a party to every dispute it cannot see | The order timeline + `outbound_events` |
| Reviews and ratings | Out of scope **by spec**. A ratings system on a low-frequency marketplace produces mostly-empty profiles, which reads worse than no profiles | Buyer protection is the trust mechanism |
| Redux / Zustand / Jotai | Server Components hold server state; URL search params hold filter state; `useState` holds the rest. There is no third category | `URLSearchParams` + RSC |
| An image-processing pipeline | Client-side compression already exists in the sell wizard and `sharp` is already a dependency for OG images | The existing compression + `next/image` |
| A generic `Repository<T>` / query-builder layer | One implementation. supabase-js *is* the query builder | Direct `supabase.from(...)` in `src/lib/db/` |
| An i18n framework | There is one language. `[D-02]` | Hebrew string literals |
| A feature-flag system | `site_config` already stores typed values and admin already edits them | A `site_config` row |
| An event bus / job queue | Seven cron jobs, all idempotent, all reading database timestamps | `runJob` + Vercel Cron |
| A design-token build step | Tailwind config already is the token source | The existing tokens |
| Wrapping supabase-js in a client factory "for testability" | There are already three deliberate clients — public/anon, server, service — each with a different security posture. A fourth wrapper hides which one you got, and that distinction is `[D-28]` and `[D-46]` | Pick the right existing client |

## Hard rules

- **No new dependency without a `docs/DECISIONS.md` entry** naming the rejected
  alternatives, including "write the ten lines". Every dependency is a supply
  chain, a bundle cost, and a future breaking change. `tailwind-merge` — a
  dependency the project genuinely needs — is also what silently dropped
  `text-white` from every primary button for the whole of Run 1. `[D-51]`
- **No abstraction with one implementation.** No interface, no factory, no
  base class, no `options` object for a value that never varies.
- **No config for a value that never changes.** `site_config` is for values the
  operator actually turns. A constant is a constant.
- **No scaffolding "for later".** Later can scaffold for itself, and will know
  more than you do.
- **Deletion over addition.** A PR that removes lines and keeps the gate green
  is a good PR.
- **Boring over clever.** Clever is what someone decodes at 3am during a
  payment incident.

## Out of scope — a product decision, not an engineering one

WhatsApp integration · a crew-facing app · automated payouts · buyer–seller chat
· reviews and ratings · auctions · multi-language · native apps · a B2B portal ·
subscriptions.

These are in `SPEC.md` §10 because the operator decided them, not because they
are hard. **Building one is not "going the extra mile", it is overruling the
operator.** If one looks necessary, that is a `restyle-feature-intake` mini-spec
and an operator conversation — not a commit.

The crew manifest is copyable text because that is what the ops flow needs
today. Payouts are marked paid by hand because the money leaves by bank
transfer. Both look unfinished and are finished.

## Where laziness stops

The ladder never argues away:

- an RLS policy on a new table,
- an `error` destructured and thrown from a Supabase read,
- a status-code assertion on a public route,
- a regression test for a bug that escaped,
- a `docs/DECISIONS.md` entry.

Those are the invariants in `CLAUDE.md`. Skipping one is not laziness, it is the
expensive kind of shortcut this skill exists to prevent — the kind that fails
silently. A single smoke test is the minimum, never the thing you cut.

---

# `/yagni-review`

A diff review that hunts **only** over-engineering. Correctness, security and
performance are explicitly out of scope — route those to a normal review pass.

## Format

One line per finding: `<file>:L<line>: <tag> <what>. <replacement>.`

| tag | means | replacement |
|---|---|---|
| `delete:` | dead code, unused flexibility, speculative feature | nothing |
| `stdlib:` | hand-rolled thing the standard library ships | name the function |
| `native:` | code doing what Next/React/CSS/Postgres already does | name the feature |
| `db:` | an invariant enforced in TypeScript that Postgres should enforce | name the constraint |
| `yagni:` | abstraction with one implementation, config nobody sets, layer with one caller | inline it |
| `shrink:` | same logic, fewer lines | show the shorter form |
| `dep:` | a new dependency for what a few lines do | name the lines |

## Examples

❌ "This validation approach might be more complex than strictly necessary — have
you considered whether all of these rules are needed at this stage?"

✅ `src/lib/pricing/engine.ts:L88: yagni: SurchargeStrategy interface, one implementation. Inline the function.`

✅ `src/components/checkout/DateField.tsx:L4: native: react-datepicker for one field. <input type="date"> — he-IL and RTL for free.`

✅ `src/lib/db/orders.ts:L52: db: TS check that commission+payout=item. The CHECK constraint already enforces it; this can only disagree with the database.`

✅ `src/lib/format.ts:L12-31: stdlib: hand-rolled agorot formatter. Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).`

✅ `src/lib/cache/tags.ts:L40-58: delete: tag namespace for a second tenant. Nothing replaces it.`

End with the only metric that matters: `net: -<N> lines possible.`
Nothing to cut → `Lean already. Ship.` and stop.

Lists findings; applies nothing.
