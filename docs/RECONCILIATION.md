# Post-run reconciliation — repo vs. remote Supabase project

Reconciles the repository against the live Supabase project `vntihvctqueohwprafwh`,
which is the source of truth for state. Two things happened after the final
report that this document accounts for: the operator's assistant audited the
remote directly through MCP, and it seeded reference data straight into
production.

Everything below was measured, not remembered.

---

## 1. Schema reconciliation

### Method

Object-level, not file-level. A fresh database was built from
`supabase/migrations/` and both sides were introspected with the same query,
producing one line per object across nine categories: tables and views,
columns (type, nullability, default), constraints, indexes, enums, functions
(signature, return type, security mode, body hash), RLS policies (command,
roles, `using`, `with check`), the RLS-enabled flag, triggers, and the table,
column and function grants held by `anon`, `authenticated` and `service_role`.

```bash
# Reference database, built from the migration files alone
createdb restyle_ref
DATABASE_URL=postgres://…/restyle_ref DB_BOOTSTRAP=db/local-bootstrap.sql \
  npx tsx scripts/db-migrate.ts

# Identical introspection on both sides, sorted, diffed
psql "$REF_URL" -tA -f introspect.sql | sort > local.txt
#   remote: the same SQL through the Supabase MCP, extracted to remote.txt
diff local.txt remote.txt
```

The introspection query is reproduced at the end of this section.

### Result

**920 objects on each side. 914 byte-identical. Six differing lines — three
functions, counted twice because a diff shows both sides.**

```
$ diff local.txt remote.txt
651c651
< FUNCTION|public.consume_rate_limit(…)|returns TABLE(…)|DEFINER|c56723c4490ced9056b4bd73c74ec134
---
> FUNCTION|public.consume_rate_limit(…)|returns TABLE(…)|DEFINER|9afc97ba60d9c791cd794e7e15d1c8c3
660,661c660,661
< FUNCTION|public.transition_listing(…)|returns listings|DEFINER|0f7c29ad75850bd73862b2e21177decd
< FUNCTION|public.transition_order(…)|returns orders|DEFINER|500dde7af0224271ae7914ffe8a12b91
---
> FUNCTION|public.transition_listing(…)|returns listings|DEFINER|b02e58719f5175977cbba5ff9652cef2
> FUNCTION|public.transition_order(…)|returns orders|DEFINER|e6b05ac31ac81d2dfe88d31d8e9936dd
```

Zero drift in tables, columns, constraints, indexes, enums, policies, RLS
flags, triggers, or grants. Signatures, return types and `SECURITY DEFINER`
matched on all three functions; only the body hash differed.

### What the three functions actually differed by

Comments. Nothing else.

Hashing each body with `--` comments stripped and whitespace collapsed makes
all thirteen functions match exactly:

```
$ diff local_fnhash.txt remote_fnhash.txt   # comment-stripped, normalized
IDENTICAL — all 13 functions are the same program
```

The textual diff on the largest of them confirms it directly — four comment
blocks present in the repo, absent on the remote, and not one executable line
different:

```
$ diff local_transition_order.txt remote_transition_order.txt
7,8d6
<   -- Row lock: two concurrent confirmations serialise instead of racing, so a
<   -- double-clicked admin button cannot produce two transitions.
17,18d14
<     -- Idempotent no-op, but still audited: a retried cron run must not refund
<     -- twice, and must still leave a trace that it ran. [D-20]
37,38d32
<   -- Every per-transition timestamp is set here, in one place. Scattered
<   -- `x_at = now()` assignments drift; this cannot.
58,59d51
<   -- Written in the same statement as the update: there is no code path that
<   -- changes status without leaving a trace, because there is no other path.
```

**Cause.** These three bodies were applied to the remote by hand through the
Supabase MCP during the build — `transition_listing` and `transition_order`
when the function-hardening work re-declared them, `consume_rate_limit` when it
moved from the `private` schema to `public` — and were retyped without their
comments. The repository kept the annotated originals.

**Fix.** `supabase/migrations/0023_function_comment_parity.sql` re-declares all
three from the repo's exact text. It is a documentation change, not a
behavioural one, and was proved to be a schema no-op before being applied:

```
$ DATABASE_URL=…/restyle_ref npx tsx scripts/db-migrate.ts
applied    0023_function_comment_parity.sql
$ diff local.txt local_after.txt
no-op confirmed: identical object inventory
```

It is worth a migration rather than a shrug because `transition_order` is the
order state machine, and the comments that had gone missing are precisely the
ones stating why the row lock exists, why a same-status transition is still
audited, and why every timestamp is written in one place. Anyone reading
`\sf transition_order` on production was getting the code with none of the
reasoning.

**After applying, byte-level parity including comments:**

```
$ diff local_raw_fn.txt remote_raw_fn.txt
IDENTICAL — every function body byte-for-byte, comments included
```

### The 22-vs-23 migration count

Both numbers were correct; they count different things.

| | Count at the time of the diff | What it is |
|---|---|---|
| `supabase/migrations/*.sql` | 22 | files in the repository |
| `supabase_migrations.schema_migrations` | 23 | statements applied to the remote |

This reconciliation adds `0023` and `0024`, so both sides now stand at **24
files and 25 ledger entries** — still one apart, still for the reason below.

The extra remote entry is **`rate_limits_public_schema`**. During the build,
`consume_rate_limit` and `prune_rate_limits` were first created in the `private`
schema, which does not work: PostgREST only resolves RPC in exposed schemas, so
`supabase.rpc('consume_rate_limit')` could never reach them. The correction was
applied to the remote as its own ledger entry, but in the repository it was
folded into `0020_rate_limits.sql` in place. The end state is identical; only
the path taken to it differs.

Seven remote ledger entries carry no `NNNN_` file prefix, because they were
applied through the MCP rather than the file runner:

| Remote ledger entry | Repository file |
|---|---|
| `legacy_archive` | `0019_legacy_archive.sql` |
| `rate_limits` | `0020_rate_limits.sql` |
| `rate_limits_public_schema` | *(folded into `0020`)* |
| `rls_performance` | `0021_rls_performance.sql` |
| `listings_read_policy` | `0022_listings_read_policy.sql` |
| `function_comment_parity` | `0023_function_comment_parity.sql` |
| `reference_data_alignment` | `0024_reference_data_alignment.sql` |

**Nothing is missing on either side.** The delta was a naming and sequencing
artefact of applying migrations two ways, and it is now documented rather than
latent.

### The "email log"

`docs/FINAL_REPORT.md` credited Phase 6 with adding an "email log". No table on
the remote has `email` in its name, and that phrasing conflated two things.

| Claim | Reality |
|---|---|
| "email log" | table **`public.outbound_events`** |
| "added in Phase 6" | table created in **`0008_engagement.sql`** (Phase 1); Phase 6 added the **admin UI that reads it** |
| — | route `/admin/notifications`, `src/app/admin/notifications/page.tsx`, nav label **יומן הודעות** |
| — | written by `src/lib/notifications/index.ts` on every send |

The table is channel-agnostic by design, which is why it is not called
`emails`: `channel text not null default 'email' check (channel in ('email',
'whatsapp', 'sms'))`. Email is the only channel implemented; WhatsApp is
explicitly out of scope for Run 1 and the column is the seam for it.

Columns, verified on the remote:

```
id uuid NOT NULL · type text NOT NULL · channel text NOT NULL
recipient text NOT NULL · recipient_role text · subject text
payload jsonb NOT NULL · idempotency_key text · status text NOT NULL
error text · sent_at timestamptz · created_at timestamptz NOT NULL
```

`outbound_events` currently holds **0 rows** on the remote, consistent with a
project that has no orders yet.

The wording in `FINAL_REPORT.md` is corrected in the post-run section.

### Introspection query

Saved at `db/introspect.sql` so this diff is repeatable rather than a one-off.

---

## 2. Reference-data reconciliation

### What was on the remote

The operator's assistant inserted reference data directly into production
through MCP: 12 categories, 12 brands, 20 delivery zones. Substantively right —
the zone bands were exactly as specified, A ₪149 / B ₪199 / C ₪249 in agorot —
and wrong in details that decide whether routes resolve.

### Row-level diff, before alignment

Canonical is `db/seed-data.ts`, rendered into the same shape as the live rows
and diffed:

```
$ diff canonical.txt remote.txt      #  < canonical      > remote
```

**Categories — 12 on both sides, all 12 names matching, 3 slugs differing:**

| Hebrew name | canonical slug | remote slug |
|---|---|---|
| ארונות ואחסון | `storage` | `closets-storage` |
| מדפים וספריות | `shelves` | `shelves-bookcases` |
| ריהוט גן | `garden` | `outdoor` |

Also: `intro_he` was **null on all twelve**, and `sort` ran 1–12 against the
canonical 10–120.

**Brands — 12 on both sides, all 12 names matching, 4 slugs differing:**

| Name | canonical slug | remote slug |
|---|---|---|
| HomeCenter | `homecenter` | `home-center` |
| רהיטי דורון | `rahitey-doron` | `rahitei-doron` |
| שמרת הזורע | `shemerat-hazorea` | `shomrat-hazorea` |
| סילון | `silon` | **`sealy`** |

`sort` again ran 1–99 against the canonical 10–999.

**Delivery zones — 20 on both sides, 19 identical, one city differing:**

| | canonical | remote |
|---|---|---|
| present only on one side | `אזור` (Azor), C, 24900 | `רחובות` (Rehovot), C, 24900 |

Every zone band and fee matched: A 14900, B 19900, C 24900.

### Why the slugs mattered

`/category/[slug]` and `/brand/[slug]` resolve by slug, and so does the seed:
`db/seed-data.ts` gives its listings `category: 'storage'`, `category:
'shelves'`, `category: 'garden'`. With the remote slugs in place, seven hub
routes would have 404'd and the seed would have failed to resolve the category
for a third of its listings.

`sealy` is the one that is not a spelling variant. The row's name is **סילון** —
Silon, an Israeli manufacturer. Sealy is a different, American company. The slug
contradicted the name it sat on, and `src/lib/seo/slug.ts` transliterates
`סילון → silon`, so the brand's own slug generator disagreed with the row.

The null `intro_he` was quieter but real: every category page renders an
introduction paragraph from that column, and all twelve would have shipped
without one.

### How it was aligned

`supabase/migrations/0024_reference_data_alignment.sql`, following the
precedent of `0013_config_defaults.sql` — reference data by migration, so a
freshly migrated database is immediately usable and the seed agrees with it.

**Upserts only. No deletes, no truncates.**

- Categories and brands are **corrected in place**, matched on their Hebrew or
  display name, so the operator's row ids survive. Guarded by `is distinct
  from`, so a re-run changes nothing.
- Any canonical row absent by both slug and name would be inserted; none were.
- Delivery zones upsert on `city`, the primary key. **The operator's רחובות row
  is matched and left alone**, and `אזור` is restored — 20 → 21 zones.
- `רחובות` was adopted into `db/seed-data.ts`, so canonical and remote now
  agree in both directions rather than the repo silently disagreeing.

### Proof it behaves as claimed

Rehearsed against a local replica of the remote's exact pre-alignment rows:

```
cat:   3 slug corrections, 0 rows whose id changed
   ארונות ואחסון: closets-storage -> storage
   מדפים וספריות: shelves-bookcases -> shelves
   ריהוט גן: outdoor -> garden
brand: 4 slug corrections, 0 rows whose id changed
   HomeCenter: home-center -> homecenter
   סילון: sealy -> silon
   רהיטי דורון: rahitei-doron -> rahitey-doron
   שמרת הזורע: shomrat-hazorea -> shemerat-hazorea

zones: 20 -> 21   (רחובות preserved, אזור restored)
```

Idempotency, three consecutive runs:

```
$ diff snapshot_after_run1.txt snapshot_after_run3.txt
IDEMPOTENT — three runs, identical rows and ids
```

Applied to the remote, then re-diffed against canonical:

```
$ diff canonical.txt remote_after.txt
ALIGNED — canonical seed and remote reference data are identical (45 rows)
```

### Route resolution

Every seeded slug, served from a production build:

```
=== /category/[slug] ===          === /brand/[slug] ===
  sofas-armchairs    200            ikea               200
  tables             200            habitat            200
  chairs             200            id-design          200
  beds-mattresses    200            beitili            200
  storage            200            shemerat-hazorea   200
  dressers           200            rahitey-doron      200
  shelves            200            aminach            200
  lighting           200            silon              200
  rugs               200            homecenter         200
  garden             200            boconcept          200
  office             200            west-elm           200
  misc               200            no-brand           200

=== control ===
  no-such-slug       404
  no-such-brand      404

ALL SLUGS RESOLVE 200
```

The control line matters: a route that returned 200 for everything would prove
nothing. Unknown slugs still 404, so the 200s are real resolutions.

---

## 3. Full gate re-run

### What could and could not run against the remote

`.env.local` points at the remote project, and the schema and data verification
in §1 and §2 ran against it directly through the Supabase MCP. The application
suites could not: the sandbox's network egress policy refuses the host.

```
$ node -e "fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/categories?...')"
status 403 Host not in allowlist: vntihvctqueohwprafwh.supabase.co.
            Add this host to your network egress settings to allow access.
```

`curl` sees the same refusal one layer down — `HTTP/1.1 403 Forbidden` on the
proxy `CONNECT`. The proxy documentation is explicit that a policy denial is to
be reported rather than worked around, so it is reported here: **this is a
one-setting environment change, not a code defect.** Adding
`vntihvctqueohwprafwh.supabase.co` to the session's egress allowlist would let
the whole gate run against the remote unchanged.

`npm run build` against the remote fails as a direct consequence, and fails
*correctly* — `/sitemap/[chunk]` reads the database at build time, so an
unreachable database aborts the build instead of publishing an empty sitemap:

```
Error: Failed to collect page data for /sitemap/[chunk]
```

Note for whoever hits this on Vercel: Next reports only that line and swallows
the underlying cause. The 403 above is what it is actually hiding.

### What the suites therefore ran against

A local database **proved equivalent to the remote in this same document**:

| | evidence |
|---|---|
| schema | §1 — 920/920 objects identical, all 13 function bodies byte-identical |
| reference data | §2 — 45/45 rows identical, verified after alignment |

So the results below are a true measure of the application against the remote's
schema and reference data. They are **not** a measure of remote network
behaviour, latency, or Supabase Auth, and nothing here should be read as
proving those.

### Results

| Check | Result |
|---|---|
| `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) | clean |
| `eslint .` | clean |
| Vitest | **77 passed** |
| `db/rls_test.sql` | **all assertions passed**, both directions per policy |
| Playwright (anon / buyer / seller / admin) | **69 passed** |
| `scripts/validate-jsonld.ts` | all assertions passed |
| `/sitemap.xml`, `/sitemap/0.xml`, `/robots.txt` | 200, 200, 200 — 54 URLs |
| `npm run build` (local db) | clean |

**Lighthouse (mobile, production build, warmed):**

| Page | Performance | SEO | Accessibility | Best practices |
|---|---|---|---|---|
| `/` | 98 | 100 | 100 | 100 |
| `/item/[slug]` | 96 | 100 | 100 | 100 |
| `/category/sofas-armchairs` | 93 | 100 | 100 | 100 |

Best practices is **100**, where the final report recorded 96. The four points
were never a code issue: they were 404s on listing photos belonging to
end-to-end test fixtures that the measurement was picking up. Measured on a
clean database, they are gone.

### The one regression the gate surfaced

The first full Playwright run came back 68/69. The failure was real, and it was
in the test rather than the product:

```
1 failed
  [admin] › tests/e2e/full-lifecycle.admin.spec.ts:205:1 › a pickup inspection
           mismatch cancels the order and refunds in full

Error: expect(received).toBe(expected) // Object.is equality
Expected: 64900
Received: 0
```

64,900 agorot is the order total — ₪500 for the item plus ₪149 zone-A delivery.
A refund of 0 against a cancelled order would be a serious product bug, so it
was worth chasing rather than re-running.

`markInspectionFailed` in `src/lib/actions/admin.ts` writes in this order:

```
224  await transitionOrder(order.id, 'cancelled', admin.id, 'inspection_failed', …)
230  const refund = await getPaymentProvider().refund(…)
235  await recordOrderEvent(…)
246    .update({ refund_agorot: order.total_agorot, refunded_at: … })
251  await releaseListingForOrder(order.id, admin.id)
```

The status lands at line 224. The refund amount lands at line 246, four
statements and one payment-provider round trip later. The test polled the first
of those and then read the second:

```ts
await expect(async () => {
  const order = await getOrder(orderId);
  expect(order?.status).toBe('cancelled');
}).toPass({ timeout: 10_000 });

const order = await getOrder(orderId);
expect(Number(order?.refund_agorot)).toBe(Number(order?.total_agorot));
```

So `toPass` could return the instant the cancellation was visible, while
`refund_agorot` was still 0 — a race that is invisible whenever the four
intervening statements happen to finish inside one poll interval, which is why
the same suite passed 69/69 twice earlier in the run. It is the same shape as
the payout `data-status` race fixed during Phase 4.

The fix polls the terminal state as a whole instead of one field of it:

```ts
await expect(async () => {
  const order = await getOrder(orderId);
  expect(order?.status).toBe('cancelled');
  expect(Number(order?.refund_agorot)).toBe(Number(order?.total_agorot));
  expect(await getListingStatus(listing.id)).toBe('active');
}).toPass({ timeout: 10_000 });
```

No product code changed. The suite then passed 69/69 twice in a row. [D-60]

### Three measurement artefacts, all mine

Recorded because both produce convincing-looking wrong numbers, and both will
recur for anyone repeating this.

**A lingering `next-server` held the port.** An earlier detached
`setsid npx next start` survived its shell. Every later `next start` found port
3100 busy and exited; every curl and Lighthouse run then talked to the *old*
process, which was still serving a build whose files had since been deleted.
The symptoms were a home page listing eight items that no longer existed in the
database, a `ChunkLoadError` for chunks removed from disk under a running
server, and one Lighthouse run scoring 82/82/88/89 with "no `<title>`" — while
`curl` on the same URL returned 200 with the correct title. Diagnosed by
checking what actually held the port:

```
$ pgrep -af next-server
3401 next-server (v16.3.1)
```

The check that settles it in one line: take the listing ids the home page
references and confirm each exists in the database.

**Measuring an ISR page cold measures the cold path.** The first request after
a build renders on demand; Lighthouse against that captures rendering, not the
page a visitor gets. Each URL is now requested twice before measuring.

**A partially loaded environment fails four tests for one reason.** The e2e
harness talks to the local stack, so the run exports `.env.test.local` over the
top of the shell. Exporting *only* that file leaves `CRON_SECRET` unset — it
lives in `.env.local` — and the four specs that drive the cron routes then fail
together:

```
4 failed
  [buyer] › lifecycle.buyer.spec.ts:177 › offers expire, and expiry is idempotent
  [buyer] › purchase.buyer.spec.ts:100  › an unconfirmed order past the window …
  [buyer] › purchase.buyer.spec.ts:139  › an unpaid abandoned checkout releases …
  [admin] › full-lifecycle.admin.spec.ts:55 › approve → … → pay out

Error: CRON_SECRET is required to exercise the cron routes
```

Four failures across three files reads like a regression; it is one missing
variable, and `tests/fixtures/db.ts` says so in the error text. The correct
invocation sources both files, narrowest last:

```
set -a; . ./.env.local; . ./.env.test.local; set +a; npx playwright test
```

None of the three artefacts was a defect in the product, and none is fixed by
anything in the diff — they are properties of the harness, and they are written
down here so the next person recognises them in seconds rather than hours.
