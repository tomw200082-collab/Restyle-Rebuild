---
description: Remove every demo listing, photo and account — never touches reference data
allowed-tools: Bash, Read, Grep, Glob
---

Remove all demo content.

```bash
npm run purge-demo -- --dry     # what would go
npm run purge-demo              # actually remove it
```

It deletes every row flagged `is_demo`, their photos from storage, and the demo
accounts.

**What it must never touch, and what to verify afterwards:** the 12 categories,
12 brands and 21 delivery zones. Those are operator-seeded reference data, some
of it hand-corrected, and they are not demo content. `[D-57]`

After a real purge, confirm:

- `listings where is_demo` → 0;
- `storage.objects` holds no demo photos;
- categories = 12, brands = 12, delivery_zones = 21 — **unchanged**;
- the catalogue still renders (empty is fine; a 500 is not).

Report the counts before and after. A purge that reports only "done" is a purge
nobody can check.
