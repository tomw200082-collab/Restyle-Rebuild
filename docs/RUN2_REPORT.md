# RUN 2 REPORT — Restyle OS

_2026-08-20 · branch `claude/restyle-os-run-2-hi1cdq` · PR #3 · nine commits, one per phase_

Run 1 built the product. Run 2 turned the repository into a governed,
self-improving product OS: a constitution, an autonomy ladder, a release gate
that fails closed, six subagents with evidence obligations, four hooks that make
the rules mechanical, CI that enforces all of it, and a reporting layer built to
be extracted.

**Active autonomy level: L1** — branch, commit, draft PR. Unchanged from the
start of the run, and deliberately so: nothing in this run merged to `main`,
deployed, moved money, or edited `CLAUDE.md`.

---

## 1. What was built

| phase | delivered |
|---|---|
| **R0** | `docs/RUN2_PLAN.md`; zero drift proved at 920 objects; three stale inherited numbers corrected |
| **G1** | `CLAUDE.md`, `EXECUTION_POLICY.md`, ADR-001, `ops/KILL_SWITCH`, `AUTONOMY_LOG.md` |
| **G2** | `SPEC.md`; six new skills; `scripts/release-gate.ts` with 13 stages; scorecard v1; the run-1 five updated |
| **G3** | six subagents, each demonstrated once with evidence under `quality/` |
| **G4** | eight slash commands; four hooks; 27 test cases proving the hooks fire |
| **G5** | `ci.yml`, `release-gate.yml`, `drift-weekly.yml`, `claude.yml`; actionlint + shellcheck clean; DEPLOYMENT.md v2 |
| **P1** | bulky surcharge; seller-pause automation; ADR-002 (no code); 26 demo listings on the live project; `vercel.json` |
| **P2** | **skipped** — legacy assets still absent (§6) |
| **B1** | eight KPI views; Hebrew daily brief; weekly report; extraction plan |

**183 files changed, ~15,900 insertions.** 30 migrations, 98 unit tests
(was 77), 77 e2e tests (was 69), 78 decisions (was 60), 11 skills, 6 agents,
8 commands, 4 hooks, 4 workflows.

---

## 2. Scorecard v1 against targets

Closing run, commit `3dcc5fa`, against the live project with demo content:

| stage | result |
|---|---|
| build + typecheck + lint | ✅ clean |
| unit tests | ✅ **98 passed** |
| RLS assertion suite | ⏭️ reference DB unseeded — **CI runs it** |
| e2e, four actor roles | ⏭️ target is not a local stack — **CI runs it** |
| JSON-LD structured data | ✅ valid |
| Hebrew copy lint | ✅ 0 leaks across 89 components |
| status codes, every public route | ✅ 25/25 at their expected status |
| computed contrast, WCAG AA | ✅ **298 interactive elements**, 0 below |
| axe accessibility | ✅ **0 critical**, 0 serious, 20 pages |
| Lighthouse budgets | ✅ all met on 3 pages |
| RTL screenshots at 390px | ✅ 10/10 match baseline |
| sold pages return 200 | ✅ |
| sitemap coverage | ✅ 48 URLs, all resolving; 14 routes covered |

**11 passed · 0 failed · 2 skipped.**

| page | performance | SEO | accessibility | budget |
|---|---|---|---|---|
| home | 92 | 100 | 100 | ≥90 / =100 / ≥95 |
| category | 92 | 100 | 100 | ≥90 / =100 / ≥95 |
| item | 92 | 100 | 100 | ≥90 / =100 / ≥95 |

**The verdict is still `fail`, and that is the gate working.** A skipped stage is
never counted as a pass `[D-63]`. The two skips are the suites that guard money
and privacy — RLS and the four-actor e2e — and both refuse a non-local target by
design `[D-65]`, because the e2e suite signs up users and drives orders to
payout and refund. CI runs them on a per-run Supabase stack. **L2 eligibility
needs a green CI run on the merge commit; it is not claimed here.**

### The time series

`quality/scorecard.json` holds five entries. The middle three are the most
useful thing in the file:

| at | commit | verdict | pass / fail / skip |
|---|---|---|---|
| 09:24 | `b43758a` | fail | 8 / 0 / 5 |
| 10:31 | `a408a88` | fail | 8 / **3** / 2 |
| 10:35 | `a408a88` | fail | 10 / 1 / 2 |
| 10:40 | `a408a88` | fail | 11 / **0** / 2 |
| 10:54 | `3dcc5fa` | fail | 11 / 0 / 2 |

Three skips became measurements the moment the catalogue had content, and the
three failures that appeared with it were real findings, fixed in twenty
minutes. That is the loop the gate exists to create.

---

## 3. Decisions — D-61 to D-78

Full text with rejected alternatives in `docs/DECISIONS.md`.

| | |
|---|---|
| **D-61** | Governance is five artifacts; `CLAUDE.md` is the only one an agent may not edit |
| **D-62** | Kill switch checked once in `runJob`; file **and** env var; a halted job returns 200 |
| **D-63** | Three gate statuses; a `skipped` stage is never a pass |
| **D-64** | Gate stages read expected status and indexability from each page's source |
| **D-65** | The e2e stage refuses any Supabase target that is not localhost |
| **D-66** | Lighthouse and axe as devDependencies; the `.env` reader as fifteen local lines |
| **D-67** | A canonical is set on the page, never on a layout |
| **D-68** | Every subagent ends with an evidence path; three are read-only by contract |
| **D-69** | CI runs against a per-run local stack; `drift-weekly` fails loudly on a missing secret |
| **D-70** | The scorecard summariser is a script, not an inline `node -e` |
| **D-71** | A gate stage that cannot read its own result fails; one thing owns the schema |
| **D-72** | Item size is priced by a named surcharge; the classifier lives in Postgres |
| **D-73** | API-role grants are stated in a migration, not inherited from the environment |
| **D-74** | An unresponsive seller's listings pause, via a `paused` status not a flag |
| **D-75** | Demo content is flagged, not segregated; the seeder works inside seller privileges |
| **D-76** | `vercel.json` sets no security headers; they live only in `next.config.ts` |
| **D-77** | Metric definitions are SQL views; `brain/` renders and computes nothing |
| **D-78** | Two CI failures were the tests and the tooling being wrong, not the product |

---

## 4. Defects found and fixed

Eight, and the pattern is worth naming before the list: **five were found by
tools built during this run, and three of those were defects in the tools
themselves.**

### In the product

**The home page had no canonical** `[D-67]`. It is the only public page with no
metadata export, because it inherits title and description from the root layout
— and a canonical is the one piece of metadata that must *not* be inherited,
since a layout-level one is picked up by every page that does not override it.
So the site's highest-authority URL shipped without one for all of Run 1. Found
by `route-auditor` on its first run. Fixed at the page, with a regression spec
and a `SPEC.md` invariant naming the layout trap rather than the instance.

**`placeholder="you@example.com"` on the login form.** Found by the Hebrew copy
lint. The field is correctly `dir="ltr"` — an email laid out RTL is unreadable —
but the field's direction and the hint's language are separate decisions.

**A surcharge configured to zero emitted a ₪0 line** `[D-72]`. Found by a test
that specified the behaviour before the code had it. Fixed by routing every
surcharge through one guard, so the total and the rendered list cannot disagree
about whether anything was charged.

**The API-role grants were inherited, not stated** `[D-73]`. Found by CI:
`db:seed` failed with `permission denied for table site_config` on a fresh
stack. Nothing was wrong with the migrations' logic — the problem is what they
never said. Every grant came from `ALTER DEFAULT PRIVILEGES`, applied only when
a table is created by the role those defaults belong to. The hosted project has
always had them, which is exactly the point: **a permission that works by
accident of environment is a permission nobody has checked.** Same shape as
`[D-44]` and `[D-45]`, both of which were real holes.

**`supabase start` already applies the migrations** `[D-71]`, so CI applied them
twice and `0021` — which creates policies without an `if not exists` guard —
failed on the second pass. The tempting fix is to make every migration
re-runnable, which is a lot of work to make double-application *safe* instead of
*absent*.

### In the tools built this run

**The gate reported "0 unit tests passed" as green** `[D-71]`. `Number(match?.[1]
?? 0)` where vitest colourises its summary in CI and the escape codes defeat the
pattern. The gate built to catch silent green produced some. It now strips ANSI
and throws when no positive count is present, with a regression test pinning the
exact coloured string.

**The `PreToolUse` hook blocked its own documentation, twice.** First scanning
every Bash command for destructive keywords, so a test harness quoting one was
refused; then, narrowed to commands invoking a SQL client, refusing the shell
call writing the README paragraph that lists those clients. The fix is a rule
rather than a third exception: a heredoc body is data being written to a file,
not a command being run. **A guard that blocks writing prose about the guard is
a guard people disable.**

**A test asserted that the environment was broken** `[D-78]`. The kill-switch
test expected `runJob` to reject without the switch — true only because no
Supabase was configured locally. CI, having a real stack, broke it.

---

## 5. Reconciliation — what the inherited numbers actually were

| the prompt said | measured | resolution |
|---|---|---|
| ~23 migrations remotely | 24 files, 25 ledger rows | same one-row delta, still explained: `rate_limits_public_schema`, folded into `0020` |
| 54 decisions, continue at D-55 | 60 already logged | Run 2 numbered from **D-61** |
| 20 delivery-zone cities | 21 | `0024` adopted רחובות and restored אזור. Remote is right |
| PR #1 | merged as `983ea58` | Run 2 opened **PR #3** |
| "email log" from Phase 6 | `public.outbound_events`, created in `0008` (Phase 1) | Phase 6 added only the admin view. Proved from the DDL |

**Zero drift, twice.** R0 measured 920 objects with an identical total digest
(`010d7f55…`) on both sides. After seven new migrations, P1 re-measured 932
objects, digest `d216229c…`, identical again. Function bodies are hashed from
`prosrc`, so this covers behaviour, not shape; policy expressions, column-level
grants and RLS flags are all included. `drift-weekly.yml` now makes it a
schedule rather than an audit.

---

## 6. Deferred, and why

**P2 — the legacy import. Skipped.** Neither `legacy/` nor `legacy-data/` exists
in the repository. `scripts/import-legacy.ts` is written and dry-run tested
against fixtures; `legacy_redirects` is 0 rows, so every `/ItemDetails?id=…`
link in already-sent email still resolves to `/catalog` rather than to its item.
`/import-legacy` is written and waits for the export. **This is the single
largest piece of inherited value still unrealised.**

**ADR-002 — returning-seller pricing. Documented, no code**, per instruction.
Five options with money impact, a recommendation (**B: email the cohort, do
nothing in the product**), and an honest statement that it cannot be decided
without the export: `legacy_users` is empty, and the three numbers that choose
between the options come from it.

**The `paused` status has no seller-facing surface yet.** A seller sees the
status on their dashboard, and the pause is undone by an admin. A "I'm back,
unpause me" self-service action would be better and is not built.

**`claude.yml` is inert** until `CLAUDE_ENABLED=true` and the API key exist.

**No admin user existed at the start of this run**, and none exists now with the
`admin` role. Three demo sellers were created. Whoever first signs in with
`ADMIN_EMAIL` gets the role — **it must be `tom@gteveryday.com` and it must be
first.**

**Demo content is on the live project** — 26 listings, 78 photos, 3 sellers, all
flagged `is_demo`. `npm run purge-demo` removes every trace and proves the
reference rows untouched by printing their counts before and after.

---

## 7. Two things worth knowing before the next session

**The sandbox now reaches the remote.** Run 1's `403 Host not in allowlist` is
gone. That single change is why this run could gate against production data
rather than a proved-equivalent copy, seed the live catalogue, and run the brief
against real rows.

**The ambient environment carries credentials for a different Supabase
project.** `SUPABASE_SERVICE_ROLE_KEY` in this container belongs to
`rvadsozabmxkkrktwgnv`, not Restyle's `vntihvctqueohwprafwh`. It failed safely
with a 401 — but had it been valid for a project that also had a `listings`
table, the demo seeder would have written a catalogue into someone else's
database and reported success. `scripts/demo-content.ts` now checks the key's
`ref` claim against the target URL and ignores a mismatch, loudly. **Any future
script taking a service-role key should do the same.**

---

## 8. The recommended next five moves

**1. Turn the two skips into passes — merge and let CI run.**
Nothing else on this list is safe until the RLS suite and the four-actor e2e
have run on a merge commit. That is one green `release-gate.yml` run away, and
it is the difference between "11 stages pass" and "L2 eligible". Add
`SUPABASE_DB_URL` as an Actions secret at the same time, or `drift-weekly.yml`
will fail its first Monday by design.

**2. Sign in as `tom@gteveryday.com`, first, and set `ADMIN_EMAIL` where the
deployed instance reads it.**
Until that happens the cockpit has no operator, the review queue cannot be
worked, and no listing a real seller submits can go live. It is the smallest
task on this list and the only one that blocks every other.

**3. Chase the Base44 export.**
It unblocks three things at once: `legacy_redirects` and the 301s that keep
already-sent links alive, the ADR-002 decision, and the returning-seller
outreach. Everything else in this run is infrastructure; this is inventory and
customers.

**4. Deploy to Vercel and run `/go-no-go`.**
The application has never been deployed. `DEPLOYMENT.md` v2 has the checklist,
the branch-protection setup (**classic protection, not rulesets**), and the
`gh pr merge --auto` 422 retry. Deploying is L3 and needs an `AUTONOMY_LOG.md`
entry.

**5. Watch delivery margin by size class for a month before touching a fee.**
`brain_delivery` splits it by size class and zone, which is the number the bulky
surcharge was built to move — and ₪80 is a guess until that view has real
deliveries in it. Resist the urge to tune it early; the `EXECUTION_POLICY.md`
bound (0–₪150) exists so the tuning, when it comes, is L4 rather than an
argument.

---

## 9. Where to start reading

1. **`SPEC.md`** — the compressed truth. A session that reads only this cannot
   violate the product.
2. **`CLAUDE.md`** — the constitution. Operator-authored; agents may not edit it.
3. **`EXECUTION_POLICY.md`** — what an agent may do without asking, and what it
   must prove first.
4. **`docs/decisions/ADR-001`** — why each gate exists, anchored to a defect
   that actually happened.
5. **`quality/scorecard.json`** — the current state of quality, as a time
   series rather than an anecdote.

The `SessionStart` hook puts the first three in front of every new session
automatically, along with the latest scorecard and its failing stages. That is
the point of the whole layer: **the next session inherits the reasoning, not
just the code.**
