# Hook evidence

Gate G4 requires that the hooks demonstrably fire. These are the harnesses and
their recorded runs. Both are runnable from a fresh checkout:

```bash
bash quality/hooks/pre-tool-use.test.sh          # 15 cases
bash quality/hooks/session-subagent-stop.test.sh # 12 cases
```

**27 cases, 27 correct.** Recorded output in `*.output.md`.

## What is proved

**PreToolUse blocks a `CLAUDE.md` edit**, by `Edit` and by `Write`, and appends
the refusal to `AUTONOMY_LOG.md` — visible in the log as `L5 REFUSED` entries
written by the hook rather than by hand. `SPEC.md` and `EXECUTION_POLICY.md`
stay editable: the constitution is the only file with a sole author.

**PreToolUse blocks destructive SQL** — a `DROP`, a `TRUNCATE`, a `DELETE`
without a `WHERE`, and a policy drop through `apply_migration` — while letting a
qualified `DELETE`, a `SELECT` and a genuine `CREATE TABLE` through. That
distinction is what makes it survivable: a guard that blocks legitimate work
gets switched off.

**SessionStart loads the governing context** — `SPEC.md`'s invariants,
`CLAUDE.md`, the active autonomy level, the latest scorecard with its failing
and skipped stages, the `PROGRESS.md` tail, and the "Next action" rule — and
**shouts when `ops/KILL_SWITCH` is present**, printing the reason from the file.

**SubagentStop rejects a completion with no evidence path** and accepts either a
repo-relative path or a URL.

**Stop rejects a response that does not end with `Next action:`**, and does not
re-block its own retry — `stop_hook_active` short-circuits it, so the rule
cannot become an infinite loop.

## Two false positives, and what they taught

This guard fired twice on work that was not dangerous, and both were the same
mistake at different depths.

**First:** the original version scanned *every* Bash command for destructive
keywords. It blocked its own test harness, because the harness's command line
quoted one of them.

**Second:** after being narrowed to commands that invoke a SQL client, it
blocked the shell call that was writing *this file* — because the paragraph
above lists the client names, and the paragraph below quoted a keyword. The
guard was right about the characters and wrong about the intent, both times.

The fix is a rule rather than another exception: **a heredoc body is data being
written to a file, not a command being run**, so it is stripped before scanning.
If destructive SQL is written into a file, that file is either a migration —
sanctioned, reviewed, reversible by a forward migration — or a script, and
running the script is itself a Bash call that gets caught then, when it would
actually do something.

This matters more than a tidy diff. A guard that blocks writing prose about the
guard is a guard people disable, and a disabled guard protects nothing. The
harness pins all three behaviours: a SQL client running a destructive statement
is blocked, a `grep` that merely mentions one is not, and a heredoc that
contains one is not.
