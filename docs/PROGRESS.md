# PROGRESS

One entry per phase: what was done, deviations from the master prompt, known gaps.

---

## Phase 0 — Deep understanding ✅

**Done**
- Confirmed repo state: single `README.md` on an initial commit. No `/legacy`, no `/legacy-data`.
- Environment recon: Node 22.22, npm 10.9, PostgreSQL 16.13 (local, started), PostgREST 12.2.3 (downloaded), no Docker daemon, GitHub releases reachable, npm registry reachable.
- **Egress finding:** the session's proxy denies CONNECT to `vntihvctqueohwprafwh.supabase.co:443` (403, policy denial). The remote Supabase project is reachable **only** via the Supabase MCP tools, not from application code running in this sandbox. See `[D-26]` and §"Infrastructure substitution" below.
- Wrote `docs/ANALYSIS.md`, `docs/DECISIONS.md`, `docs/COPY.md`, this file.
- **`docs/LEGACY_INTELLIGENCE.md` arrived mid-phase and was saved verbatim**, then ANALYSIS.md was rewritten (revision 2) and 13 reconciliation decisions (`D-31`…`D-43`) appended to DECISIONS.md, per master prompt §2.

**Findings that changed the plan**
1. The legacy app is **request-first with manual phone payment**, not an on-platform-payment marketplace. v2 inverts this.
2. **72% of all legacy orders (68/94) died waiting for seller confirmation.** One order completed in five months. This is the business's central failure mode and now drives KPI and reminder decisions (`[D-43]`).
3. **Pricing model is inverted** — legacy sellers name a *net* price with a 12% markup added; v2 sellers name a *gross* price with 20% deducted. Consequences and mitigations in ANALYSIS §7 C-1, `[D-35]`, `[D-36]`.
4. **v2's flat zone delivery fees appear to sit below cost** on a catalogue that is 60% tier-4 sofas. Built as specified, but instrumented so the gap is visible (`[D-37]`, ANALYSIS §7 C-2).
5. The business already runs on **Sumit**, not PayPlus. Both adapters will be built (`[D-38]`).
6. Legacy has **no RLS at all** — every authenticated user could read every order and every seller's home address. RLS verification is a Gate 1 blocker (`[D-31]`).
7. Legal/marketing copy is available verbatim and is reused, with **three factual corrections** (`[D-39]`).

**Deviations from the master prompt**
- None yet. Three conflicts between the master prompt and ground truth were resolved in the master prompt's favour and recorded (ANALYSIS §7 C-1, C-2, C-3); one addition (a Sumit adapter alongside the specified PayPlus one) is additive, not a substitution.

**Known gaps**
- No `/legacy-data`, so `scripts/import-legacy.ts` (Phase 5) will be written and unit-tested but not executed against real rows.

---

## Infrastructure substitution (applies to the whole run)

Per master prompt §9, documented here rather than left implicit.

| Concern | Production (Tom's environment) | This sandbox |
|---|---|---|
| Database | Supabase project `vntihvctqueohwprafwh` (eu-central-1) | Local PostgreSQL 16 |
| Schema | Applied via the Supabase MCP `apply_migration` | Same migration files applied to local PG |
| REST API | Supabase PostgREST | **Real PostgREST 12.2.3** against local PG — same wire protocol, same RLS enforcement |
| Auth | Supabase Auth (Google OAuth + email OTP) | Minimal GoTrue-compatible shim issuing the same HS256 claims (`sub`, `role`, `email`, `aud`, `exp`) |
| Storage | Supabase Storage bucket `listing-photos` | Local file-backed storage shim on the same `/storage/v1` paths |

Why this shape: using the **real** PostgREST binary means RLS is genuinely enforced end-to-end in tests rather than simulated — and RLS is the defect class that actually matters here, given the legacy app had none. Application code uses `@supabase/supabase-js` unchanged in both environments; only `NEXT_PUBLIC_SUPABASE_URL` differs. `docs/POST_RUN_HOOKUP.md` will carry the exact commands to point everything at the remote project.
