# AUTONOMY_LOG.md

Append-only. One entry per **L2-or-above** action, and one per **refused L5
request**. Never edited, never reordered, never pruned — a log that can be
tidied is a log nobody can rely on.

Levels are defined in `EXECUTION_POLICY.md`.

**Format**

```
## <ISO-8601 UTC> — L<n> — <action in one line>
- **Actor:** <session or human>
- **Evidence:** <path, command output, URL — something checkable>
- **Notes:** <optional; for L4, the key, old value, new value and its bound>
```

What does **not** belong here: L0 reads, L1 commits and draft PRs. Those are the
default working mode and logging them would bury the entries that matter. The
git history is the record for L1.

---

## 2026-08-20T09:00:00Z — L1 — Run 2 governance layer bootstrapped
- **Actor:** Claude Code session, branch `claude/restyle-os-run-2-hi1cdq`
- **Evidence:** `CLAUDE.md`, `EXECUTION_POLICY.md`,
  `docs/decisions/ADR-001-restyle-governance.md`, `ops/`, this file;
  `tests/unit/kill-switch.test.ts` → 8 passed
- **Notes:** Logged as the seed entry although L1 is not normally recorded — the
  first entry has to establish the format, and the artifact it creates is the
  ladder itself. The active level is **L1** from here.
