---
description: Generate the Hebrew morning brief from the KPI views
allowed-tools: Bash, Read, Grep, Glob, Write
---

Generate the operator's morning brief.

```bash
npm run brief
```

It queries the KPI views in `brain/` and renders a Hebrew markdown brief:
yesterday's numbers, pending reviews, orders awaiting scheduling, and anomalies.

If a number looks wrong, **do not recompute it inline**. The views are the
sanctioned definitions; a metric recomputed by hand disagrees with the dashboard
within a month and then nobody knows which number is real. Fix the view in a
migration, or say the view is wrong and stop.

Read it before handing it over, and add one line at the top if something in it
needs a decision today rather than a glance. The brief is for a person about to
start their day, not an archive.

`brain/README.md` describes how this moves to the `restyle-production-brain`
repository and runs on a schedule from there.

End with the path to the rendered brief.
