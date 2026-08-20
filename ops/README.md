# ops/

Operational controls that live in the repository because they must be
greppable, reviewable, and impossible to lose in a dashboard.

## KILL_SWITCH

**Presence halts automation.** If a file named `KILL_SWITCH` exists in this
directory, every cron job and every subagent stops before doing any work and
reports that it halted.

Create it:

```bash
touch ops/KILL_SWITCH && git commit -am "ops: kill switch on — <reason>"
```

For a deployed instance, where the filesystem is a build artifact and `touch`
does nothing useful, set the environment variable instead — both are checked:

```
KILL_SWITCH=1
```

Creating the switch is allowed at any autonomy level, by anyone, always.
**Removing it is L5** — an operator action. See `EXECUTION_POLICY.md`.

Halting is not failing. A cron route that halts returns HTTP 200 with
`{"halted": true, ...}`: the job did exactly what it was told. Returning 5xx
would make Vercel retry the very automation the operator just stopped.

## KILL_SWITCH.example

Committed so the shape is visible in a clean checkout. It is **not** the switch —
only a file named exactly `KILL_SWITCH` halts anything.
