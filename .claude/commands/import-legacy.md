---
description: Import the Base44 legacy export — dry run first, always
allowed-tools: Bash, Read, Grep, Glob, Write
---

Import the legacy Base44 data. **The dry run is not optional and comes first.**

1. Check `ops/KILL_SWITCH`. If present, stop.
2. Confirm the assets exist: `legacy/` (the Base44 source export) and/or
   `legacy-data/` (the JSON collection export). If neither is present, say so
   and stop — the importer has never seen real data and there is nothing to
   import.
3. **Dry run, always:**
   ```bash
   npm run import:legacy -- --dry
   ```
4. Write the dry report and read it yourself. Report:
   - rows by collection, and how many would be inserted, skipped, or conflict;
   - `legacy_redirects` that would be created — this is the point of the whole
     exercise, since every already-sent `/ItemDetails?id=…` link currently
     resolves to `/catalog` rather than to its item;
   - anything that would fail a constraint, with the row;
   - **anything touching money.** Legacy sellers named a *net* price and v2
     sellers name a *gross* one; the importer takes `display_price`, and that
     mapping is the single most consequential line in the report. See
     `docs/decisions/ADR-002-returning-seller-pricing.md`.
5. **Stop.** Present the dry report and ask for explicit confirmation.
6. Only after a human confirms, run for real, then verify:
   - `legacy_redirects` is populated;
   - `/ItemDetails?id=<hex>` 301s to the new slug, **in both letter casings**
     `[D-42]`;
   - an unmapped legacy id goes to `/catalog`, never a 404;
   - `/drift-check` still clean.

A real run writes production rows. It is never autonomous, however clean the dry
report is.
