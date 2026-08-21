# Handoff to Run 2

Open items at the close of Run 1, verified against the live Supabase project
`vntihvctqueohwprafwh` and against this repository — not against memory. Each
line is current-state accurate as written.

For what *was* done and how it was proved, see `docs/RECONCILIATION.md` and
`docs/FINAL_REPORT.md` §7.

> **Run 2 has since landed** (governance, CI, the release gate, six subagents,
> migrations `0025`-`0031`, and demo content). Its own record is
> `docs/RUN2_PLAN.md` and `docs/RUN2_REPORT.md`. The items below were
> re-verified against the live project and this tree on **2026-08-20**, after
> that merge; the ones that have closed are struck through rather than deleted,
> so this still reads as a record of what Run 2 inherited.

---

## Blocking a first sign-in

**Still open: no admin user exists, and the earlier advice here was wrong.**
`profiles` with `role='admin'` is **0**, and `site_config.admin_email` is the
**empty string** on the live project. Three accounts now exist — the demo
sellers — but none is the operator.

This section previously said "whoever signs in first with that address becomes
the admin, so it must be that address and it must be first." That is unsafe as
things stand. `handle_new_user` sets `role` only on INSERT, and its
`on conflict do update` never touches `role`; with `admin_email` empty, a first
sign-in creates a permanent `role='user'` profile and setting `admin_email`
afterwards changes nothing. **Signing in first, right now, would burn the
address rather than claim the cockpit.** `[D-96]`

`ADMIN_EMAIL` in the environment is not the same value: the only thing that
copies it into `site_config` is `db/seed.ts`, which also creates fake listings
and known-password accounts, so it must never run against production.

The order is not optional — set the row, then sign in:

```sql
-- 1. As the operator, in the Supabase SQL editor:
update public.site_config set value = to_jsonb('tom@gteveryday.com'::text)
 where key = 'admin_email';
```

```
-- 2. Then, and only then, sign in once at /login with that address.
--    The OTP tab needs no password; the trigger grants admin on the insert.
```

Setting that row is **L5** under `EXECUTION_POLICY.md` — "`admin_email` | **L5**
| Changes who holds the cockpit" — so no agent may do step 1, in any session,
under any instruction. It is two minutes of operator time and it unblocks
everything else on this page.

## Blocking anything visible

**Not deployed, as far as this repository can tell.** There is still no
`.vercel` directory and no linked project in the tree. That is local evidence
only — a project linked from elsewhere would not show up here — so treat it as
"no evidence of a deployment" rather than proof of none. `docs/DEPLOYMENT.md`
has the full checklist; the four items that lose money are at the top of it.

~~**No demo content on the remote.**~~ **Closed by Run 2.** The remote now holds
**26 listings and 78 storage objects**, where Run 1 measured 0 and 0. Run 2 added
`scripts/demo-content.ts`, `db/demo-data.ts`, a `0029_demo_content_flag`
migration and a `purge-demo` command, so demo rows are flagged and removable —
which is what `npm run db:seed` was not — that one also creates three accounts
with a known password, so it stays a staging tool. Reference data is unchanged:
12 categories, 12 brands, 21 delivery zones, shipped by migration `0024`.

## Blocked on someone else

**Legacy assets not delivered.** Neither `/legacy` (the Base44 source export)
nor `/legacy-data` (the JSON collection export) exists in this repository.
`scripts/import-legacy.ts` is written, dry-run tested against fixtures, and has
never seen real data. Until the export arrives, `legacy_redirects` stays at 0
rows and every `/ItemDetails?id=…` link in already-sent email resolves to
`/catalog` rather than to its item.

**The pricing inversion is still the operator's call.** Legacy sellers named a
*net* price; v2 sellers name a *gross* one and 20% is deducted, so a returning
seller who types the number they are used to receives 20% less. The software
side is done — the wizard shows a live payout figure and the importer takes
`display_price` — but the decision to accept that, change the rate, or warn
returning sellers before they list has not been made. Run 2 wrote it up as
`docs/decisions/ADR-002-returning-seller-pricing.md`, still **Proposed —
awaiting the operator's decision**, with no behaviour changed. Background in
`docs/FINAL_REPORT.md` §5.

## Infrastructure

~~**`v0.1.0` is not tagged on the remote.**~~ **Done — 2026-08-21.**

```
$ git ls-remote --tags origin
49784645719cf60f0f5fedf723181664d1e1375b	refs/tags/v0.1.0
983ea589bde4f3cdd8becdf1bd8ae80fc97fbea6	refs/tags/v0.1.0^{}
```

It names **Run 1's** release point, `983ea58`, not the current head — `main` has
moved on through Run 2, and tagging the tip would have given the tag a different
meaning than the one it was authorised for.

The session still cannot push a tag directly; every ref under `refs/tags/`
returns 403, as do `POST /git/tags` and `POST /git/refs`. It goes through
`.github/workflows/tag-release.yml` instead — `workflow_dispatch`,
`contents: write`, and five guards that all had to pass. That workflow is the
route for the next tag too. `[D-97]`

~~**No CI.**~~ **Closed by Run 2.** `.github/workflows` now holds four
workflows — `ci.yml`, `release-gate.yml`, `drift-weekly.yml` and `claude.yml` —
so the gates Run 1 could only run by hand are enforced on a pull request.

**The sandbox cannot reach the remote.** Egress returns `403 Host not in
allowlist: vntihvctqueohwprafwh.supabase.co`, so the application suites in Run 1
ran against a local database proved object-identical to the remote rather than
against the remote itself. Adding that host to the session's egress settings is
a one-setting change and would let the next run gate directly against
production.

---

## Not blocking, worth knowing

- **`npm run db:reset` before measuring anything.** The end-to-end suite leaves
  listings behind whose photos were never uploaded, and a Lighthouse run
  immediately afterwards scores those 404s against the product.
- **Kill stray `next-server` processes before benchmarking.** A detached
  `next start` that outlives its shell keeps the port and serves a deleted
  build; every measurement then describes a version that no longer exists. Run 1
  lost time to this twice. `pgrep -af next-server` settles it.
- **`db/introspect.sql` is the schema truth check.** One line per object, same
  query both sides, diff. It is what turned "the migrations are applied so it
  matches" into a measurement.
