# RUN 2 PLAN — Restyle OS

_Phase R0 output. Compiled 2026-08-20 against the working tree at `983ea58` and
the live Supabase project `vntihvctqueohwprafwh`. Every number below is measured,
not recalled._

Run 1 built the product. Run 2 turns the repository into a governed,
self-improving product OS: a constitution, an autonomy ladder, a release gate
that fails closed, subagents with evidence obligations, hooks that make the
rules mechanical, and CI that enforces all of it on every pull request.

---

## 1. Inherited state — verified, not assumed

| Claim in the master prompt | Measured | Verdict |
|---|---|---|
| 37 routes | 37 `page.tsx` + sitemap/robots/OG/cron/webhook handlers | ✅ exact |
| ~23 migrations applied remotely | **24 files**, **25 remote ledger entries** | ⚠️ see §2.1 |
| 5 project skills | 5 in `.claude/skills/` | ✅ |
| 77 unit tests | `vitest run` → **77 passed** in 4 files | ✅ |
| 69 e2e tests | `playwright test --list` → **69 tests in 11 files** | ✅ |
| PR #1 | merged as `983ea58` | ✅ merged, not open |
| 54 decisions | **60** (`D-01`…`D-60`, no gaps) | ⚠️ see §2.3 |
| operator-seeded reference data | 12 categories, 12 brands, **21** delivery zones | ⚠️ 21, not 20 — see §2.4 |

**Evidence**

```
$ npx vitest run
 Test Files  4 passed (4)      Tests  77 passed (77)

$ npx playwright test --list
 Total: 69 tests in 11 files

$ find src/app -name page.tsx | wc -l
 37
```

Remote row counts (Supabase MCP, project `vntihvctqueohwprafwh`):

```
auth.users 0 | brands 12 | categories 12 | delivery_zones 21 | legacy_redirects 0
listings 0 | orders 0 | outbound_events 0 | profiles 0 | site_config 19 | storage.objects 0
```

---

## 2. Reconciliation

### 2.1 The migration-count delta — 24 files, 25 remote entries, one explained row

The master prompt inherited the "22 vs 23" framing from the operator's audit.
Both numbers have since moved by two (migrations `0023` and `0024` landed during
the post-run reconciliation), but **the delta is unchanged and is still exactly
one row**:

| | count |
|---|---|
| `supabase/migrations/*.sql` | 24 |
| `supabase_migrations.schema_migrations` on the remote | 25 |

The extra remote entry is `20260820034820 rate_limits_public_schema`. It was the
correction that moved `consume_rate_limit` out of the `private` schema, applied
remotely as its own ledger entry during the build and **folded into
`0020_rate_limits.sql`** in the repository. Same end state, two paths to it.
The remote ledger also carries `legacy_archive`, `rate_limits`, `rls_performance`,
`listings_read_policy`, `function_comment_parity` and `reference_data_alignment`
without their `00NN_` prefixes, because they were applied through the MCP by
name rather than by filename — a naming difference, not a content difference.

**File count is not the measurement.** The measurement is §2.2.

### 2.2 Object-level parity — 920/920, byte-identical

A reference database was built from scratch from the 24 files
(`db/local-bootstrap.sql` + `scripts/db-migrate.ts`), then `db/introspect.sql`
was run against both sides and reduced to a per-category MD5 of the
newline-joined, sorted object lines.

| kind | n | digest (local == remote) |
|---|---|---|
| COLGRANT | 286 | `4ac926eface4be54c5a35ba39eb17ab0` |
| COLUMN | 234 | `d97b333776b1990772e749735f11f121` |
| CONSTRAINT | 106 | `007c4196755a1a13d54b6be6d39a0771` |
| ENUM | 5 | `c63dac386cc4b5babcc596f3d3f207d5` |
| FUNCGRANT | 17 | `99f8855b2de6d51300b9c1cb4bdfb60e` |
| FUNCTION | 13 | `5b0cbf54a32ce752230668852d8049e8` |
| INDEX | 67 | `5c1e520b94e3136e92f5ff09ad1ac9da` |
| POLICY | 59 | `0247e27821c29a1c4188ec529694defe` |
| RLS | 22 | `498d810e1c257448a624ccbc8a31e46e` |
| TABLE | 26 | `558c17f22e1d0068cbbe3be9488b5146` |
| TABLEGRANT | 72 | `bfe061c597e71de79d5dddbac7f0c346` |
| TRIGGER | 13 | `204093ae58b26f331a918cb9c47306f1` |
| **TOTAL** | **920** | **`010d7f55b049c4c2cb83711cf0ab28b3`** |

`diff local-digest.txt remote-digest.txt` → empty.

**Zero unexplained drift.** Function bodies are hashed from `pg_proc.prosrc`, so
this covers behaviour, not just shape; policy `USING`/`WITH CHECK` expressions,
column-level grants (where `[D-45]` lives) and the RLS flag are all included.

Phase G5 turns exactly this query into `/drift-check` and `drift-weekly.yml`, so
the answer to "does the repo still mirror production?" is a scheduled
measurement instead of an audit.

### 2.3 Decision numbering — Run 2 starts at D-61, not D-55

`docs/DECISIONS.md` contains 60 entries, `D-01` through `D-60`, with no gaps
(`D-16` and `D-17` were written during the post-run reconciliation, and `D-60`
records the flaky-spec fix). The master prompt's "54 decisions, continue from
D-55" predates those three additions. **Run 2 decisions are numbered from
`D-61`.**

### 2.4 Delivery zones — 21, not 20

The master prompt says 20 operator-seeded cities. The remote holds 21: migration
`0024` adopted the operator's added row **רחובות** and restored **אזור**, which
the operator's set lacked. Both are correct and neither was deleted. Nothing to
do; recorded so the next audit does not re-flag it.

### 2.5 The "email log" — it is `public.outbound_events`

Confirmed by reading the schema, not the report.

| Phase 6 wording | Reality |
|---|---|
| "email log" | table **`public.outbound_events`** |
| "added in Phase 6" | created in **`0008_engagement.sql`** (Phase 1) |
| — | Phase 6 added only the **admin view**: `/admin/notifications` |

The table is deliberately channel-agnostic:

```sql
channel text not null default 'email' check (channel in ('email','whatsapp','sms')),
idempotency_key text unique,
status text not null default 'queued' check (status in ('queued','sent','failed','skipped'))
```

Email is the only implemented channel; the name reflects the contract, not
today's single implementation. `FINAL_REPORT.md` §7 already corrected the
wording — this entry closes the item by proving it from the DDL.

### 2.6 The Run-1 egress blocker is gone

Run 1 could not reach the remote from the sandbox
(`403 Host not in allowlist: vntihvctqueohwprafwh.supabase.co`). It resolves now:

```
$ curl -o /dev/null -w '%{http_code}' https://vntihvctqueohwprafwh.supabase.co/rest/v1/
401
```

`401` is the API answering an unauthenticated request — the host is reachable.
This is the single change that lets Run 2 gate against production data rather
than against a proved-equivalent local copy. It does not change any gate's
definition; it changes what the gate can be pointed at.

---

## 3. Conflicts flagged and how they are resolved

| # | Conflict | Resolution |
|---|---|---|
| C-1 | Prompt says continue decisions at D-55; ledger is at D-60 | Run 2 uses **D-61+**. §2.3 |
| C-2 | Prompt says 22/23 migrations; actual is 24/25 | Same one-row delta, re-measured. §2.1 |
| C-3 | Prompt says 20 delivery-zone cities; remote has 21 | Remote is right. §2.4 |
| C-4 | Prompt says PR #1 open; it is merged | Run 2 opens a **new** PR from `claude/restyle-os-run-2-hi1cdq` |
| C-5 | `vercel.json` already exists with 7 crons (P1.5 says "create") | P1 **extends** it (security headers, region) rather than recreating |
| C-6 | ponytail / superpowers plugin installs need a marketplace + Node hooks | Attempt, then fall back to the in-repo adaptations, which are the mandatory deliverable either way |
| C-7 | Lighthouse + axe + visual diff need browsers and a running server | Gate stages are **capability-gated**: each stage reports `pass`/`fail`/`skipped(reason)`; a skip is never silently a pass, and CI runs the full set |
| C-8 | P2 legacy import is conditional on assets | `legacy/` and `legacy-data/` are **absent** (verified). P2 is skipped and recorded |

---

## 4. Phase-by-phase mapping of current state

### G1 — governance bootstrap
Nothing exists. No `CLAUDE.md`, no `EXECUTION_POLICY.md`, no `docs/decisions/`,
no `ops/`, no `AUTONOMY_LOG.md`. Cron auth exists
(`src/app/api/cron/[job]/route.ts`, constant-time bearer check, `[D-20]`) and is
the correct place to add the kill-switch check — one guard, seven jobs, because
all seven route through `runJob`.

### G2 — skill packs
Five skills exist and are strong. Missing: `SPEC.md` at root, the YAGNI ladder,
spec-discipline/backprop, the three process skills, and the release gate. The
gate has real material to work with: `npm run verify:all` already chains
typecheck → lint → unit → RLS → build → e2e → JSON-LD. The gate adds status-code
assertions, computed contrast, axe, Lighthouse budgets, RTL screenshots, Hebrew
copy lint, sold-page 200, sitemap coverage, and the scorecard.

### G3 — subagents
`.claude/agents/` does not exist. `ops-analyst` is now genuinely useful because
of §2.6 — it can read the real project.

### G4 — commands + hooks
`.claude/settings.json` does not exist; `.claude/` holds only `skills/`.

### G5 — CI/CD
`.github/` does not exist. `npm run verify:all` is the one command a workflow
needs. `supabase start` in CI is the honest way to get PostgREST + Auth, since
the local stack script expects a PostgREST binary at `/opt/restyle-local` that
is not in the image.

### P1 — product remainders
- **Bulky surcharge.** `listings` already requires `width_cm`, `depth_cm`,
  `height_cm` (all `not null`, 1–1000). Volume and longest edge are derivable
  today — no schema change needed for the classifier. `site_config` has 19 rows
  and gains `bulky_surcharge_agorot`. `computeOrderPricing` is pure and has a
  `Surcharge[]`, so the change is additive: one new `SurchargeCode`.
- **Seller pause.** `sellerTimeout` already cancels + refunds at 48h and
  `sellerReminder` fires at 24h. The counter of consecutive expired
  confirmations does not exist yet and needs a column plus config
  `seller_pause_after_expired`.
- **ADR-002.** Document only. No code.
- **Demo content.** `listings` and `storage.objects` are both 0 on the remote.
  Reference data must not be touched.
- **`vercel.json`.** Exists with the 7 cron schedules matching `JOB_NAMES`.
  Extend, do not replace.

### P2 — legacy import
`legacy/` and `legacy-data/` absent → skipped, recorded in RUN2_REPORT.md.
`scripts/import-legacy.ts` and `/import-legacy` wait for the export.

### B1 — production-brain
Nothing exists. The KPI views have real tables to read: `orders`, `payouts`,
`deliveries`, `listings`, `offers`, `order_events`.

---

## 5. Order confirmed

`R0 → G1 → G2 → G3 → G4 → G5 → P1 → P2(skipped) → B1 → Final`

Two ordering notes, both deliberate:

- **G2 before G3/G4** — the subagents call the gate, and the hooks load
  `SPEC.md`. Building the callee first means the callers are demonstrable the
  moment they exist.
- **G5 before P1** — CI must be able to fail on the change before the change
  lands. P1 is the first work that CI actually guards.

## 6. Cross-tranche items deferred here

Per the operating protocol, work discovered inside one phase that belongs to
another is logged here rather than done out of order.

| Found in | Item | Belongs to |
|---|---|---|
| R0 | Kill-switch check inside `runJob` | G1 |
| R0 | `SIZE_CLASS` thresholds need per-category tuning | P1 |
| R0 | Local stack needs a PostgREST binary; CI should use `supabase start` | G5 |
| R0 | No admin user exists on the remote (`auth.users` = 0) — first sign-in with `ADMIN_EMAIL` claims the role | operator, pre-launch |

---

_Next action: Phase G1 — author the constitution, the autonomy ladder, ADR-001,
the kill-switch and the autonomy log._
