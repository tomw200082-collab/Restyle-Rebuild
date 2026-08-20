---
description: Deploy-readiness check — gate, drift, env sanity, kill switch
allowed-tools: Bash, Read, Grep, Glob
---

Decide whether production may be deployed. **L3 requires L2 first** — you cannot
deploy what is not on `main`.

Check in this order and **stop at the first failure**. A later check passing
does not compensate for an earlier one failing.

1. **Kill switch.** `ops/KILL_SWITCH` absent, and `KILL_SWITCH` unset in the
   target environment. If present: stop. Someone stopped automation on purpose.
2. **Gate green on this exact commit.** The latest `quality/scorecard.json`
   entry must have `verdict: "pass"` and its `commit` must match `HEAD`. A pass
   on a different commit is not a pass on this one.
3. **Schema parity.** Run `/drift-check`. `supabase/migrations` must equal the
   live schema at object level. Un-applied migrations block the deploy; so does
   remote drift, and that one is more urgent.
4. **Environment sanity.**
   - every variable in `.env.example` has a non-placeholder value in the target;
   - `PAYMENT_PROVIDER` is what the operator expects — **switching it to a live
     provider is L5**, so confirm rather than assume;
   - `CRON_SECRET` is set and is not the example value. These endpoints cancel
     orders and issue refunds;
   - `ADMIN_EMAIL` is set. Without it the first sign-in grants nobody the admin
     role and the cockpit has no operator;
   - `NEXT_PUBLIC_SITE_URL` is the real origin. Every canonical, OG URL, sitemap
     entry and email link is built from it.
5. **Migrations applied.** No local migration file absent from the remote ledger.

Report **GO** or **NO-GO** as the first line, then the checks with their
results, then — for a NO-GO — the single next action that would change it.

You do not deploy. L3 is an operator action and needs an `AUTONOMY_LOG.md`
entry. Produce the evidence that makes it a decision rather than a hope.
