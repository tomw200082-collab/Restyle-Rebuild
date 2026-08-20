# Handoff to Run 2

Open items at the close of Run 1, verified against the live Supabase project
`vntihvctqueohwprafwh` and against this repository — not against memory. Each
line is current-state accurate as written.

For what *was* done and how it was proved, see `docs/RECONCILIATION.md` and
`docs/FINAL_REPORT.md` §7.

---

## Blocking a first sign-in

**No admin user exists.** `auth.users` is 0, `profiles` is 0, `profiles` with
`role='admin'` is 0 on the remote — nobody has ever signed in, so the
`handle_new_user` trigger has never granted the role. `ADMIN_EMAIL` is set to
`tom@gteveryday.com` in the local `.env.local`, but it is not yet set anywhere
a deployed instance would read it; whoever signs in first with that address
becomes the admin, so it must be that address and it must be first.

## Blocking anything visible

**Not deployed to Vercel.** No `.vercel` directory, no linked project, no
environment variables set there. `docs/DEPLOYMENT.md` has the full checklist;
the four items that lose money are at the top of it.

**No demo content on the remote.** `listings` is 0, `storage.objects` is 0. The
`listing-photos` bucket exists and is the only bucket. Reference data *is*
present and correct — 12 categories, 12 brands, 21 delivery zones, shipped by
migration `0024` — so the catalogue renders, it is simply empty. `npm run
db:seed` would populate it but also creates three accounts with a known
password, so it is a staging tool, not a production one.

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
returning sellers before they list has not been made. `docs/FINAL_REPORT.md` §5.

## Infrastructure

**`v0.1.0` is not tagged on the remote, and needs one command.** The merge
landed as `983ea589bde4f3cdd8becdf1bd8ae80fc97fbea6` — a real merge commit with
both parents, so the phase-by-phase history is intact on `main`. The tag could
not be created from the build session: pushing any ref under `refs/tags/`
returns `HTTP 403`, and both `POST /git/tags` and `POST /git/refs` return
`Write access to this GitHub API path is not permitted through this proxy`.
Nothing about the repository blocks it; the session's credentials only permit
pushing its own branch. From a normal checkout:

```
git fetch origin main
git tag -a v0.1.0 983ea589bde4f3cdd8becdf1bd8ae80fc97fbea6 -m "Restyle v2 — first production-ready build"
git push origin v0.1.0
```

**No CI.** No `.github/workflows`. Every gate in this project runs from the
command line and nothing enforces them on a pull request; `npm run verify:all`
is the single command a workflow would need to call.

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
