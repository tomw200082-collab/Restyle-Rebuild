---
description: Run the release gate and give an L2-readiness verdict
allowed-tools: Bash, Read, Grep, Glob, Write
---

Run the full release gate and report whether this branch may merge to `main`.

1. Check `ops/KILL_SWITCH`. If present, stop and say so.
2. Read `.claude/skills/restyle-release-gate/SKILL.md` if you have not already.
3. Run `npm run release-gate`. Set `DATABASE_URL` to the local reference
   database first if you want the RLS stage to run.
4. Report, in this order:
   - **the verdict**, unsoftened;
   - each failure, as a *finding* rather than as output — say what it means for
     the product, not what it printed;
   - each skip, and whether it is eligible: its reason must be in
     `ALLOWED_SKIPS` **and** CI must have run that stage on this commit;
   - a diff against the previous scorecard entry — a stage that passed last run
     and fails now is the most important line in the report, and a metric
     sliding while still passing is the second;
   - **L2 verdict: eligible / not eligible**, and why.

Never relax a stage to obtain a verdict. If a stage fails because the product is
wrong, say so and stop — the fix goes through `restyle-root-cause-debug`, not
through the stage's threshold.

You do not merge. L2 is an operator action and needs an `AUTONOMY_LOG.md` entry.
End with the scorecard path and the evidence directory.
