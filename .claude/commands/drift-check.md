---
description: Object-level diff of supabase/migrations against the live schema
allowed-tools: Bash, Read, Grep, Glob
---

Prove that the repository still mirrors the remote — as a measurement, not a
belief.

```bash
npm run drift-check
```

It builds a reference database from `supabase/migrations`, runs
`db/introspect.sql` against both sides, and compares per-category digests over
every object in `public` and `private`: tables, columns with type, nullability
and default, constraints, indexes, enums, function signatures **and body
hashes**, policy `USING` / `WITH CHECK` expressions, RLS flags, triggers, and
the table, column and function grants held by `anon`, `authenticated` and
`service_role`.

Those last three categories are there deliberately: `[D-44]` and `[D-45]` were
both privilege bugs, invisible in any schema dump that stops at DDL.

**Migration file count is never the measurement.** Files and ledger rows can
differ legitimately — a correction applied remotely on its own and folded into
an existing file in the repository is one file, two ledger rows, and zero drift.
That exact case took two manual audits to re-establish before this command
existed.

Report:

- the total object count and whether the digests match;
- for any mismatch, the category and the specific differing objects;
- for each difference, **which side is right**. A remote-only object is usually
  a hand-applied change that needs capturing as a migration; a repo-only object
  is usually a migration that was never applied.

Never "fix" drift by editing an applied migration. A correction is always a new
migration. `CLAUDE.md` §4.

R0's baseline: 920 objects, total digest `010d7f55b049c4c2cb83711cf0ab28b3` on
both sides.
