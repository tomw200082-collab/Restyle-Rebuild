# EXECUTION_POLICY.md — the autonomy ladder

How much an agent may do without asking, and what it must prove first.
Governed by `CLAUDE.md`; ratified by `docs/decisions/ADR-001-restyle-governance.md`.

**Current active level: L1.**

The ladder is cumulative — L3 requires L2 to have passed, which requires the
gate. Each level names its trigger, its evidence, and what it is forbidden from
touching. When in doubt, act at the level below.

---

## The ladder

### L0 — read, analyse, report
**Always free. No approval, no gate, no log.**

Reading any file, running any read-only query, running the test suite, running
the release gate in report mode, crawling routes, producing audits and
scorecards, writing analysis into `quality/` or `docs/`.

Forbidden even here: reading a secret out of the environment and printing it.

---

### L1 — branch, commit, draft PR
**Active default. This is the mode every session runs in unless the operator
says otherwise.**

Create a branch, commit work to it, push it, open a **draft** pull request.
Write code, tests, migrations (as new files), documentation, skills, agents,
hooks and workflows.

**Evidence required:** the commit and the PR URL. Tests relevant to the change
run green locally before the push.

**Forbidden:** pushing to `main`; force-pushing any branch that is not this
session's own; touching anything in `CLAUDE.md` §4 "Forbidden".

---

### L2 — merge to `main`
**Only after `/release-check` passes with a green scorecard.**

**Trigger:** the operator asks for a merge, or a standing instruction covers it.

**Evidence required, all four:**
1. `quality/scorecard.json` has a new entry whose `verdict` is `pass`.
2. Every required check on the PR is green (`ci`, `release-gate`).
3. No unresolved review threads.
4. An `AUTONOMY_LOG.md` entry: timestamp, `L2`, what merged, the scorecard path.

**Fails closed.** A gate stage that errors, times out, or cannot run is *not* a
pass. A `skipped` stage is a pass only when its skip reason is in the gate's
allowed-skip list *and* CI ran that stage on this commit.

**Forbidden:** merging a PR that changes `CLAUDE.md`; merging with a failing or
missing required check; merging to bypass a review the operator asked for.

---

### L3 — deploy to production
**Only after `/go-no-go` passes. Requires L2 first — you cannot deploy what is
not on `main`.**

`/go-no-go` checks, in order, and stops at the first failure:

1. The release gate is green on the exact commit being deployed.
2. `supabase/migrations` == the remote schema (`/drift-check`, object-level).
3. Environment sanity: every variable in `.env.example` has a non-placeholder
   value in the target environment; `PAYMENT_PROVIDER` is what the operator
   expects it to be; `CRON_SECRET` is set and is not the example value.
4. `ops/KILL_SWITCH` is absent.

**Evidence required:** the `/go-no-go` transcript, the deployment URL, and an
`AUTONOMY_LOG.md` entry.

**Forbidden:** deploying with pending un-applied migrations; deploying a commit
that is not on `main`; deploying while the kill switch is present.

---

### L4 — bounded config mutations
Changing operational values in `site_config` through the admin console or a
migration, **strictly inside the operator-preset bounds below.**

A value outside its bound is **L5**, not "L4 with a good reason".

| key | bound | why the bound |
|---|---|---|
| `commission_pct` | **frozen at 20** | The take rate is the business model. Any change is L5. |
| `floor_surcharge_agorot` | 0 – 10000 | Above ₪100/side the buyer reads it as a penalty. |
| `floor_surcharge_min_floor` | 2 – 5 | Below 2 charges for a ground-floor lift-less carry. |
| `disassembly_surcharge_agorot` | 0 – 20000 | Crew time; ₪200 is two people for an hour. |
| `bulky_surcharge_agorot` | 0 – 15000 | Above ₪150 it exceeds the zone-A fee itself. |
| `cancellation_fee_agorot` | 0 – 5000 | ₪50 is the **published** figure. Raising it above the Terms is L5. |
| `offer_min_pct` | 50 – 90 | Below 50 the offer flow becomes a haggling channel. |
| `min_price_agorot` | 2000 – 20000 | Below ₪20 delivery costs more than the item. |
| `offer_expiry_hours` | 24 – 168 | |
| `offer_checkout_hours` | 6 – 48 | Must stay ≤ `seller_confirm_hours`. |
| `protection_hours` | 24 – 72 | 48 is **published**. Lowering it below the Terms is L5. |
| `seller_confirm_hours` | 24 – 72 | The single most consequential number in the product. |
| `seller_reminder_hours` | 1 – (`seller_confirm_hours` − 1) | A reminder after the deadline is noise. |
| `seller_pause_after_expired` | 2 – 5, or `0` to disable | |
| `listing_ttl_days` | 30 – 365 | |
| `resale_window_days` | 0 – 30 | 7 is **published**. |
| `min_photos` / `max_photos` | 1–5 / 5–20 | |
| `capture_mode` | `immediate` only | `authorize_capture` is an unbuilt flow. L5. |
| `admin_email` | **L5** | Changes who holds the cockpit. |

**Evidence required:** an `AUTONOMY_LOG.md` entry naming the key, the old value,
the new value, the bound it sits inside, and why.

**Forbidden:** any key not in this table; any value outside its bound; changing
a value that contradicts a published policy page without changing that page in
the same change.

---

### L5 — never autonomous
No trigger, no evidence, no exception. An agent that finds itself about to do
one of these stops and reports.

1. **Executing a refund, payout, or live payment against real money.** Writing
   the code path is L1. Running it against a live provider is the operator's
   hand on the button.
2. **Fee or commission changes outside the L4 bounds** — including any change to
   `commission_pct`.
3. **Deleting or mutating production rows outside the state machines.** No
   `DROP`, no `TRUNCATE`, no `DELETE` without a `WHERE`, no direct
   `UPDATE … SET status`.
4. **Editing `CLAUDE.md`.** Refuse, and log the request.
5. **DNS or domain operations.**
6. **Switching `PAYMENT_PROVIDER` to a live provider** (`payplus`, `sumit`).
7. **Any write to the legacy Base44 application.** It is a read-only historical
   record.
8. **Removing `ops/KILL_SWITCH`.**
9. **Committing or printing a secret.**

---

## Refusing well

Refusal is not obstruction. When an action is above the current level:

1. Say which level it is and which rule applies.
2. Do everything below that level that is still useful — write the migration,
   write the test, prepare the exact command.
3. Hand the operator the one thing only they can do, ready to run.
4. Log the request in `AUTONOMY_LOG.md` if it was an L5 request.

## The kill switch

Before any cron job or subagent does work, it checks for `ops/KILL_SWITCH`. If
the file exists, it halts and reports. Creating the file is always allowed at
any level, by anyone. Removing it is L5.

## Changing this file

`EXECUTION_POLICY.md` is not `CLAUDE.md` — an agent may *propose* changes here
through a normal PR, and the operator merges them. The L4 bounds table in
particular is expected to move as real numbers arrive from production. Changing
a bound requires a `docs/DECISIONS.md` entry saying what evidence moved it.
