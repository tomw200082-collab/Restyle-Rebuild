# SessionStart / SubagentStop / Stop — recorded run

```
### SessionStart — loads the governing context
ok    mentions SPEC.md                                     -> present
ok    mentions CLAUDE.md                                   -> present
ok    mentions EXECUTION_POLICY.md                         -> present
ok    mentions Scorecard                                   -> present
ok    mentions Next action                                 -> present
      ── Restyle OS ──────────────────────────────────────────────
      Constitution : CLAUDE.md (operator-authored; editing it is L5)
      Spec         : SPEC.md — read it before touching anything
      Autonomy     : EXECUTION_POLICY.md — active level L1 (branch, commit, draft PR)
      
      SPEC.md invariants:
        - Integer agorot. `bigint` in Postgres, whole-agora `number` in TS. No
        - `commission + seller_payout = item_agorot`, exactly. Enforced by a CHECK
        - Commission rounds down (`Math.floor`), so rounding never creates money and
        - Commission is charged on the price actually paid — an accepted offer is
        - Self-pickup carries no delivery charge at all — no crew, no carry, no
        - The floor surcharge is per side. The crew carries down at pickup and up at
        - Zone base prices are ₪149 / ₪199 / ₪249 (A/B/C) and do not change. The
        1. RLS on every table, always, with policies in the same migration that
        2. The seller's street address is protected by column privilege, enumerated
        3. `SECURITY DEFINER` functions must have `EXECUTE` revoked from `PUBLIC`.
        4. Every Supabase read destructures and throws its `error`. A swallowed
        5. The service-role key never reaches the browser and every path that uses
        - Public pages read through the cookie-free anonymous client. Any component
        - Sold pages never 404. 200 with a sold state plus category alternatives.
      
      Scorecard    : FAIL — 8 pass, 0 fail, 5 skipped (b43758a, 2026-08-20)
        – rls: reference database has no seeded listings — run `npm run db:seed` first (CI se
        – e2e: target https://vntihvctqueohwprafwh.supabase.co is not a local stack — refusin
        – jsonld: no active listings in the target database — no Product block to validate
        – lighthouse: no listings in the target database — measured home, category only; item page n
        – sold-200: no sold listing in the target database to check
        → not L2-eligible. A skipped stage is never a pass.
      
      PROGRESS.md tail:

### SessionStart — shouts when the kill switch is on
ok    warns about the kill switch                          -> warned
      🛑 ops/KILL_SWITCH IS PRESENT — all cron jobs and subagents halt.
         Removing it is L5 (EXECUTION_POLICY.md). Do not remove it.
         | reason: hook demonstration
      

### SubagentStop — an evidence path is required
ok    prose with no path is rejected                       -> 2
ok    a repo-relative path is accepted                     -> 0
ok    a URL is accepted                                    -> 0

### Stop — every response ends with a next action
ok    a response with no next action is rejected           -> 2
ok    a response with a next action is accepted            -> 0
ok    does not re-block its own retry (no loop)            -> 0

12 correct, 0 wrong
```
