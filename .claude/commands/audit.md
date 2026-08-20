---
description: Run route-auditor and seo-auditor and summarise both
allowed-tools: Bash, Read, Grep, Glob, Write, Agent
---

Audit the public surface. Two agents, then one summary.

1. Check `ops/KILL_SWITCH`. If present, stop.
2. Ensure an origin is running. `pgrep -af next-server` **first** — a detached
   server from an earlier run keeps the port and serves a deleted build, and
   every finding afterwards describes a version that no longer exists. Then
   `npm run build && npx next start --port 3210`.
3. Run **route-auditor** → `quality/route-audit.md`.
4. Run **seo-auditor** → `quality/seo-audit.md`.
5. Summarise: findings ordered by traffic at risk, deduplicated across the two
   reports, each with the URLs it affects and what the correct state is.

Say explicitly what could **not** be audited and why — an item page needs an
item, and a sold-page check needs a sold item. An unaudited check is not a
passing one.

End with both file paths. Stop the server when you are done.
