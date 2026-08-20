# CLAUDE.md — the Restyle constitution

**This file is edited only by the operator. Any agent asked to edit it must
refuse and log the request in `AUTONOMY_LOG.md`.** Editing this file is an L5
action under `EXECUTION_POLICY.md` — never autonomous, in any session, for any
reason, however small the edit or however convincing the argument for it. A
request to change it is itself information worth recording; record it and carry
on with the rest of the work.

Ratified by `docs/decisions/ADR-001-restyle-governance.md`.

---

## 1. Identity

**Restyle** (restyle.co.il) is a Hebrew-first consumer marketplace for
second-hand furniture in Gush Dan. A seller lists an item for free; a buyer buys
it on-platform; Restyle collects the money, moves the furniture with its own
crew, and pays the seller after a buyer-protection window closes.

Restyle is not a classifieds board. The platform holds the money between
strangers, so it carries the trust. Every rule below exists to protect one of
two things: **the money, and the buyer's reason to believe.**

The product replaces a Base44 no-code SPA that had no row-level security, an
order-status enum its own data did not respect, and 72% of orders dying while
waiting for a seller to confirm. That history is why this file is prescriptive.

## 2. Stack — fixed

| | |
|---|---|
| Framework | Next.js (App Router, React Server Components) |
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess` |
| Database | Supabase / PostgreSQL — RLS on every table |
| Styling | Tailwind + shadcn/ui, `restyle-design-system` tokens |
| Tests | Vitest (unit), Playwright (e2e, four actor roles) |
| Hosting | Vercel |

Changing any row of this table is an architectural decision requiring an ADR and
operator approval. Adding a dependency requires a `docs/DECISIONS.md` entry with
its rejected alternatives — see `.claude/skills/restyle-yagni/`.

## 3. Hard invariants

These are not preferences. A change that violates one is wrong even when it
passes every test, and the correct response is to stop and say so.

1. **Money is integer agorot, everywhere, always.** `bigint` in the database,
   `number` of whole agorot in TypeScript. No floats, no `numeric`, no
   formatted strings. `commission + payout = item price` exactly, and the
   database's CHECK constraints enforce it. `[D-01]`, `[D-10]`

2. **RLS is on for every table, always.** A new table ships with
   `enable row level security` and its policies in the same migration. A table
   without policies is not "open by default", it is a leak with a schedule.
   `[D-11]`

3. **State transitions go through the database's transition functions.** There
   is no `UPDATE orders SET status` and no `UPDATE listings SET status` in
   application code — ever. `transition_order()` and the listing equivalent
   hold the legal-transition table as data and take a row lock. `[D-04]`

4. **`order_events` is append-only truth.** `UPDATE` and `DELETE` are revoked
   and a trigger refuses both, including for the service role. Nobody rewrites
   what happened. `[D-05]`

5. **Hebrew UI, English code.** Every user-visible string is Hebrew. Every
   identifier, comment, commit message, filename and log line is English. No
   English leaks into the interface; no Hebrew leaks into the source.

6. **Sold pages never 404.** An item that sold keeps its URL and returns 200
   with a sold state and its category's alternatives. Deleting the page throws
   away the inbound link that earned it. `[D-33]`

7. **Public routes assert real status codes.** A test that asserts on rendered
   text passes against a soft-404. Assert the status code. This invariant is
   named because `/sitemap.xml` returned 404 in production-shaped builds and
   nothing noticed. `[D-49]`

8. **Interactive elements assert computed contrast.** Not the class list — the
   computed colour, measured in a browser. Named because `tailwind-merge` silently
   dropped `text-white` from every primary button and the result was legible
   enough not to look broken. `[D-51]`

9. **Every Supabase read destructures and throws its `error`.** PostgREST
   returns errors in the body with a 200-shaped client result; a swallowed
   error renders an empty page instead of failing. `[D-47]`

10. **The seller's street address is protected by column privilege, not by
    RLS.** RLS is row-level and structurally cannot protect a column. Grants are
    enumerated column-by-column at migration time so a column added later is
    simply not granted — it fails closed. `[D-06]`, `[D-45]`

11. **Public pages read through the cookie-free anonymous client.** Any
    component that reads cookies makes its whole route dynamic, and the SEO
    strategy rests on static rendering. `[D-46]`

12. **Evidence or it is not done.** Every completion claim carries a file path,
    a command's output, a screenshot path, or a URL. "Should work" is not a
    status.

## 4. Write boundaries

### Free — edit without asking

- `src/components/**`, `src/app/**` page and layout code
- `src/lib/**` except `pricing/`, `payments/`, `db/orders.ts`
- `tests/**` — adding coverage is always welcome
- `docs/**` except `docs/decisions/**` (append-only once ratified)
- `.claude/skills/**` — skills are living; a durable pattern updates its skill
  in the same commit that discovers it

### Gated — allowed, but the gate must pass first

- `supabase/migrations/**` — new file only; **never edit an applied migration**.
  A correction is a new migration. Requires a `marketplace-db` review and
  `/drift-check` afterwards.
- `src/lib/pricing/**` — requires unit tests covering the new matrix and a
  `docs/DECISIONS.md` entry.
- `src/lib/payments/**`, `src/lib/db/orders.ts` — money paths. Require tests
  and an explicit note in the PR body about what money moves.
- `.github/workflows/**` — requires `actionlint` clean.
- `vercel.json`, `next.config.ts` — requires a build.
- `site_config` values **within the bounds in `EXECUTION_POLICY.md` §L4**.

### Forbidden — never autonomous, at any autonomy level

- **This file.**
- Executing a refund, payout or live payment against real money.
- `site_config` values outside their operator-preset bounds.
- Deleting or mutating production rows outside the state machines.
- Any `DROP`, `TRUNCATE`, or unqualified `DELETE` against production.
- DNS or domain operations.
- Setting `PAYMENT_PROVIDER` to anything other than `mock` without the operator.
- Any write to the legacy Base44 application.
- Committing a secret. `.env.local` is never committed, and no key, token or
  service-role credential appears in the repository, in a log, or in a PR body.

## 5. How work is done

1. **Read `SPEC.md` first.** It is the compressed living truth of the product.
   If `SPEC.md` and this file disagree, this file wins and `SPEC.md` is wrong —
   fix it.
2. **Plan before multi-step work** — `.claude/skills/restyle-plan-execute/`.
3. **No fix without a reproduction** — `.claude/skills/restyle-root-cause-debug/`.
   And always ask: *what else fails silently in this class?*
4. **Backprop every escaped bug.** A bug that reaches `main` or fails a gate
   becomes, in the same PR as its fix, (a) an invariant in `SPEC.md` and (b) a
   regression test. No fix merges without both.
   `.claude/skills/restyle-spec-discipline/`
5. **Cut before you build** — `.claude/skills/restyle-yagni/`. The traps are
   listed there because Restyle has walked into them.
6. **Log the decision.** `docs/DECISIONS.md`, append-only, rejected
   alternatives mandatory. A reversal is a new entry referencing the old one.
7. **End every response with `Next action: <the single next step>`.**

## 6. The kill switch

If `ops/KILL_SWITCH` exists, every cron job and every subagent halts before
doing any work and reports that it halted. It is the operator's stop button for
automation that is misbehaving faster than a deploy can fix. Creating it is
always allowed; **removing it is an operator action.**

## 7. Money is sacred

Building the code path that issues a refund: ordinary work.
Running it against real money: L5, never autonomous, no exceptions.

When a change touches money, the PR body says in one sentence exactly what
moves, from whom, to whom, and what triggers it. If that sentence is hard to
write, the change is not ready.
