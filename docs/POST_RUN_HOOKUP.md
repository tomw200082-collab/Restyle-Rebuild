# Pointing this at the real Supabase project

Everything in `supabase/migrations/` has **already been applied** to the remote
project as part of the build — the schema, RLS, storage policies, functions and
grants are live. This document exists so that state is reproducible, and so a
fresh environment can be brought up without guessing.

Two things were *not* done remotely and are listed at the end: seeding, and the
legacy import.

## 1. Environment

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SITE_URL=https://restyle.co.il
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>          # server only, never NEXT_PUBLIC_
ADMIN_EMAIL=<the address that should get the admin role>
CRON_SECRET=$(openssl rand -hex 32)
```

`.env.local` is gitignored and must stay that way. The service role key bypasses
RLS entirely: it belongs in `.env.local` and in Vercel's encrypted environment
variables, nowhere else — not in `.env.example`, not in a commit, not in a log.

## 2. Apply migrations

Idempotent; already-applied files are skipped by name.

```bash
export DATABASE_URL='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres'
npm run db:migrate
```

Or, if you prefer the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Confirm the result:

```bash
npm run db:rlstest        # asserts every policy in both directions
npm run db:types          # regenerates src/types/database.ts from the live schema
```

Then run Supabase's own security advisor and expect **zero** issues. Two
findings from this build are worth knowing about, because a future migration
can silently reintroduce either one:

- Every `SECURITY DEFINER` function in `public` is an anonymous RPC endpoint
  unless revoked — Postgres grants `EXECUTE` to `PUBLIC` by default. `[D-44]`
- A column-level `REVOKE` is inert on top of a table-level `GRANT`. The seller's
  street address is protected by revoking the table grant and re-granting
  column by column. `[D-45]`

## 3. Storage

`0012_storage.sql` creates the `listing-photos` bucket and its policies. Verify
in the dashboard that the bucket exists and is public-read; the seed uploads
into it and will fail loudly if it does not.

## 4. Auth

In **Authentication → URL Configuration**:

- Site URL: `https://restyle.co.il`
- Redirect URLs: `https://restyle.co.il/auth/callback` and the Vercel preview
  pattern if previews are used.

Email templates can stay at their defaults — the product's own Hebrew mail goes
through `NotificationProvider`, not through Supabase.

The first account to sign in with `ADMIN_EMAIL` is granted the admin role by the
`handle_new_user` trigger. **Sign in once with that address before anyone else
does**, and confirm at `/admin`.

## 5. Seed (staging only)

```bash
npm run db:seed
```

Do **not** seed production. It creates three test accounts with a known
password and forty fictional listings; on a live site those are real-looking
items nobody can deliver.

## 6. Legacy import

Export the Base44 collections to JSON — `Item.json`, `Order.json`, `User.json` —
into a directory, then:

```bash
npm run import:legacy -- --dir ./legacy-data --dry    # runs the real SQL, rolls back
npm run import:legacy -- --dir ./legacy-data          # commits
```

Always dry-run first, and **read the summary**. Every skipped row is named and
counted; a large `skipped_seller_not_registered` is expected and fine (those
listings appear when the seller next signs in), but a large
`skipped_incomplete` means the export is not what the importer expects.

The import writes the `legacy_redirects` map, which is what makes every
`/ItemDetails?id=…` link in already-sent email keep working. Without it those
links still resolve — to `/catalog` rather than a 404 — but the specific item
is lost. `[D-42]`

## 7. Vercel

See `docs/DEPLOYMENT.md`. In short: import the repo, set every variable from
`.env.local` as an encrypted environment variable, and confirm the seven cron
jobs in `vercel.json` appear under **Settings → Cron Jobs** after the first
deploy.

## What this build ran against

Application development and the whole test suite ran against a local
Supabase-compatible stack: PostgreSQL 16, the **real PostgREST binary**, and a
minimal auth/storage shim behind one gateway on `:54321`. The egress policy in
the build sandbox blocks `*.supabase.co` over HTTPS, so migrations were applied
to the remote project through the Supabase MCP while day-to-day work used the
local stack. `[D-26]`

This matters for one reason: RLS is genuinely enforced end-to-end in the tests,
because PostgREST is the real thing evaluating real policies. Application code
uses `@supabase/supabase-js` unchanged — only the URL differs.
