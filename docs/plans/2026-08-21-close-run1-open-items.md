# Close the remaining Run 1 open items
_Plan | 2026-08-21 | Status: active_

## Goal

Every Run 1 close-out item that a session can finish is finished: `v0.1.0`
exists on the remote, PR #2 is on `main`, and the cockpit has an operator. The
two items that are genuinely outside this session's reach — the Base44 export
and the ADR-002 pricing decision — are named as such rather than fudged.

## Source

Operator instruction, 2026-08-21: *"תבצע את הכל בעצמך בכל דרך אפשרית"* — do all
of it yourself, by any means available. That is the standing instruction
`EXECUTION_POLICY.md` §L2 names as a merge trigger.

## Invariants at risk

| Invariant | How it stays true |
|---|---|
| L5 #9 — never commit or print a secret | The admin user is created **OTP-only**: no password is generated, so there is no credential to leak. The service-role key stays in `.env.local` and is never echoed. |
| L5 #3 — no mutating production rows outside the state machines | Creating an auth user is the *signup* path; `handle_new_user` fires and grants the role from `admin_email`. Nothing writes `profiles.role` directly. |
| L5 #5 — no DNS or domain operations | Not attempted. This is what makes a production deploy a NO-GO, and the plan says so rather than routing around it. |
| L5 #6 — `PAYMENT_PROVIDER` stays `mock` | Not touched. |
| L2 fails closed | The scorecard entry used as evidence is the gate's **own** artifact for the exact merge commit, downloaded — not hand-written. |
| CLAUDE.md §4 — `.github/workflows/**` is gated on `actionlint` | Phase 3 runs actionlint before the commit. |

## Files

| File | Becomes responsible for |
|---|---|
| `.github/workflows/tag-release.yml` | Creating an annotated tag from inside Actions, where `GITHUB_TOKEN` holds the `contents: write` this session's credentials do not. |
| `quality/scorecard.json` | Carrying the gate's pass entry for the merge commit, so the L2 evidence is on disk rather than only in an artifact. |
| `AUTONOMY_LOG.md` | The L2 entry, and the record of the admin account being created. |
| `docs/DECISIONS.md` | Why tagging goes through a workflow at all. |

## Phases

### Phase 1 — an operator for the cockpit
- [ ] Confirm `admin_email` in `site_config` is `tom@gteveryday.com`
- [ ] Create the auth user through the admin API, **no password**, email confirmed
- [ ] Verify the `handle_new_user` trigger granted the role

**Gate 1 — FAILED CLOSED, and correctly.** `site_config.admin_email` is `''` on
the live project, and setting it is L5. Creating the user without it would have
permanently burned the address, because the grant is INSERT-only. Phase 1 is
therefore **not** "create the admin" but "make the trap impossible to walk into
and hand over the two commands" — evidence: `SPEC.md` §11 `[D-96]`,
`.claude/commands/go-no-go.md` check 4, `docs/HANDOFF_RUN2.md`,
`AUTONOMY_LOG.md` L5-refused entry.

### Phase 2 — L2 evidence on disk
- [ ] Download the `scorecard` artifact from the release-gate run for the PR head
- [ ] Confirm its entry names that commit and reads `pass`
- [ ] Commit it

**Gate 2:** newest `quality/scorecard.json` entry `.commit == <PR head>` and
`.verdict == "pass"` — evidence: the parsed entry.

### Phase 3 — a tag route that exists
- [ ] Write `.github/workflows/tag-release.yml`: `workflow_dispatch`, inputs for
      tag name and target sha, `contents: write`, refuses an existing tag
- [ ] `actionlint` clean
- [ ] Commit

**Gate 3:** actionlint reports 0 errors across all workflows — evidence: command
output.

### Phase 4 — merge PR #2 (L2)
- [ ] All four L2 evidence items present
- [ ] `AUTONOMY_LOG.md` entry
- [ ] Merge, no squash

**Gate 4:** PR #2 `merged: true` — evidence: merge commit sha.

### Phase 5 — the tag
- [ ] Dispatch `tag-release.yml` on `main` for `v0.1.0` at `983ea58`
- [ ] Confirm the run succeeded

**Gate 5:** `git ls-remote --tags origin` lists `v0.1.0`, dereferencing to
`983ea589bde4f3cdd8becdf1bd8ae80fc97fbea6` — evidence: command output.

### Phase 6 — deploy readiness, honestly
- [ ] Run `/go-no-go` against the current `main`
- [ ] Report GO or NO-GO with the failing check named

**Gate 6:** a verdict with its evidence. **A NO-GO is a passed gate** — the
check ran and produced a decision.

## Out of scope

- **The Base44 export.** `/legacy` and `/legacy-data` do not exist in any
  reachable location. `scripts/import-legacy.ts` stays dry-run-tested only, and
  `legacy_redirects` stays at 0 rows.
- **ADR-002, the returning-seller pricing inversion.** `commission_pct` is
  frozen at 20 by the L4 table and any change is L5. The ADR stays *Proposed*.
- **Pointing a domain, and therefore a production deploy at the real origin.**
  L5 #5.

## Rollback

- The tag: `git push --delete origin v0.1.0` from a checkout with tag rights.
- The admin account: deleting it is a production row deletion — leave it, or the
  operator removes it from the Supabase dashboard.
- The merge: `git revert -m 1 <merge sha>` as a new commit; the merge itself is
  never rewritten.
