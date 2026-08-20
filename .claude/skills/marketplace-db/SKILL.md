---
name: marketplace-db
description: Use for any Restyle database work — writing or editing SQL migrations, designing schema, adding or debugging RLS policies, writing Supabase queries through supabase-js, seeding data, changing order or listing status logic, or regenerating TypeScript types. Triggers on "migration", "schema", "RLS", "policy", "SQL", "table", "seed", "supabase query", "gen types", "status transition", "order_events". Carries the money-in-agorot rule, the DB-enforced state machine pattern, the append-only audit pattern, RLS templates per role, and the idempotent seed pattern.
---

# Restyle database patterns

The database is the last line of defence for money, privacy, and order state. Every rule here exists because the system this replaces got it wrong — the legacy app had **no row-level security at all** and an order-status enum its own data didn't respect.

## Non-negotiables

1. **Money is `bigint` agorot.** Never `numeric`, never `float`, never a formatted string. Columns end in `_agorot`. Formatting to ₪ happens in the view layer only. `[D-01]`
2. **Schema changes are migration files**, timestamped in `supabase/migrations/`, forward-only. Never edit an applied migration — write a new one. `db/schema.sql` is a generated bootstrap for fresh databases, not a place to author changes.
3. **RLS is enabled on every table in `public`**, with no exceptions. A table without a policy is a table nobody can read, which is the correct default — it fails closed.
4. **Status changes go through the transition function.** Never `update orders set status = …` from application code.
5. **Every table that mutates has `created_at`, `updated_at`**, and `updated_at` is maintained by the shared trigger — not by application code, which admin SQL and cron jobs bypass. `[D-23]`

## Money

```sql
price_agorot        bigint not null check (price_agorot >= 5000),   -- ₪50 minimum
commission_agorot   bigint not null check (commission_agorot >= 0),
seller_payout_agorot bigint not null check (seller_payout_agorot >= 0),
constraint order_money_balances
  check (commission_agorot + seller_payout_agorot = item_agorot),
constraint order_total_balances
  check (total_agorot = item_agorot + delivery_agorot + surcharges_agorot)
```

Those two balance constraints are worth more than any test. They make an arithmetically impossible order literally unstorable, so a fee-engine bug surfaces as a failed insert at the moment it happens rather than as a payout discrepancy discovered a month later.

Commission rounds **down** (`floor`), and payout is derived by subtraction, never by its own rounded formula — that is what keeps the balance constraint satisfiable for every input. `[D-10]`

## State machines in the database

Both `listings.status` and `orders.status` are Postgres enums whose legal transitions are stored as **data**, and enforced by **one** function.

```sql
create table order_status_transitions (
  from_status order_status not null,
  to_status   order_status not null,
  primary key (from_status, to_status)
);
```

```sql
create or replace function transition_order(
  p_order_id   uuid,
  p_to         order_status,
  p_actor      uuid,
  p_event_type text,
  p_payload    jsonb default '{}'::jsonb
) returns orders
language plpgsql
security definer
set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'no_data_found';
  end if;

  if v_order.status is distinct from p_to
     and not exists (
       select 1 from order_status_transitions
       where from_status = v_order.status and to_status = p_to
     ) then
    raise exception 'illegal order transition: % -> %', v_order.status, p_to
      using errcode = 'check_violation';
  end if;

  update orders
     set status = p_to,
         -- per-transition timestamp columns set here, in one place
         confirmed_at = case when p_to = 'confirmed'  then now() else confirmed_at end,
         delivered_at = case when p_to = 'delivered'  then now() else delivered_at end,
         completed_at = case when p_to = 'completed'  then now() else completed_at end
   where id = p_order_id
   returning * into v_order;

  insert into order_events (order_id, actor_id, type, payload)
  values (p_order_id, p_actor, p_event_type,
          p_payload || jsonb_build_object('from', v_order.status, 'to', p_to));

  return v_order;
end $$;
```

Four properties make this pattern worth the ceremony:

- **`for update` row lock** — two concurrent confirmations serialise instead of racing. A double-clicked admin button cannot produce two transitions.
- **Transitions as rows, not `if` branches** — the legal graph is queryable, testable, and diffable, and adding a state is an insert rather than a rewrite.
- **The audit row is written in the same statement as the update.** There is no code path that changes status without leaving a trace, because there is no *other* code path.
- **Timestamp columns are set in one place.** Scattered `confirmed_at = now()` assignments drift; this cannot.

`security definer` is required so the function can write `order_events` even where the caller's RLS forbids direct inserts. Always pin `set search_path = public` on a definer function — without it, a caller-controlled `search_path` can shadow the tables it references.

Idempotency: a transition to the status the order already has is a **no-op that still records an event**, not an error. Cron jobs deliver at-least-once, and a retried auto-cancel must not raise. `[D-20]`

## Append-only audit

```sql
create table order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete restrict,
  actor_id   uuid references auth.users(id),
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

revoke update, delete on order_events from authenticated, anon, service_role;

create or replace function order_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'order_events is append-only';
end $$;

create trigger order_events_no_mutate
  before update or delete on order_events
  for each row execute function order_events_immutable();
```

Both layers are needed. The `revoke` stops normal roles; the trigger stops the table owner and any future `security definer` function, which `revoke` does not. `on delete restrict` on the FK means an order with history cannot be deleted — the audit outlives the convenience of cleanup.

## RLS

Full copy-paste templates in `references/rls-templates.sql`. The model in words:

| Role | Sees |
|---|---|
| `anon` | listings in `active`/`reserved`/`sold` and their photos; categories, brands, delivery zones. **Never** `pickup_street`. |
| owner | their own rows, all statuses (`auth.uid() = seller_id` / `user_id`) |
| counterparty | the other side of an order they belong to — buyer sees seller's pickup address only once the order is paid |
| admin | everything, via `is_admin()` |
| `service_role` | bypasses RLS entirely — so every service-role code path must do its own authorization check `[D-28]` |

Two helpers, both `stable` so the planner caches them per statement:

```sql
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function owns_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from orders
     where id = p_order_id and (buyer_id = auth.uid() or seller_id = auth.uid())
  )
$$;
```

**The address rule, and the trap in it.** `pickup_street` must be unreadable through the API. Two things about this are counter-intuitive and both were found the hard way:

1. **RLS cannot protect a column.** RLS is row-level. A signed-in buyer legitimately reads any *active* listing's row, so row policies alone hand them the address. Column privileges are the only mechanism.
2. **`revoke select (col) on t from role` is inert on top of a table-level grant.** In Postgres `GRANT SELECT ON t` covers every column, present and future, and a column-level revoke cannot subtract from it. The working form is to revoke the table grant and re-grant column by column:

```sql
do $$
declare v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'listings'
     and column_name <> 'pickup_street';
  execute 'revoke select on public.listings from anon, authenticated';
  execute format('grant select (%s) on public.listings to anon, authenticated', v_cols);
end $$;
```

Enumerate the columns at migration time rather than hardcoding them: a column added later is then simply not granted, which fails closed. `pickup_street` ends up readable only by `service_role`, and the address is revealed through server-side paths that check authorization first — admin manifests, and the buyer of a paid order. `[D-06]`, `[D-45]`

**Assert privilege rules in `db/rls_test.sql` for `authenticated`, not only `anon`.** The anon-only version of this assertion passed while every signed-in user could read every seller's home address.

**Write RLS policies in pairs.** A `for select` policy without a matching `for insert`/`update` policy silently blocks writes, and the resulting error (`new row violates row-level security policy`) is easy to misread as a validation bug. State `using` for reads and `with check` for writes explicitly, even when they're identical.

**Every policy set gets an assertion in `db/rls_test.sql`**, which runs in Gate 1. Assert both directions: the permitted read returns rows *and* the forbidden read returns zero. A test that only checks the happy path passes against a wide-open table.

**Never hardcode a row count in the assertions.** The e2e suite creates real listings and orders, so `= 30` turns the RLS suite into something that fails for reasons unrelated to RLS — and a suite that cries wolf gets ignored. Capture the expected counts as the table owner *before* switching roles:

```sql
begin;
create temp table expected on commit drop as
  select (select count(*) from public.listings where status = 'active') as active;
grant select on expected to anon, authenticated;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$ begin
  assert (select active from expected) > 0, 'fixture must have data to test with';
  assert (select count(*) from public.listings where status = 'active')
         = (select active from expected), 'anon must see every active listing';
end $$;
rollback;
```

Pair every "sees everything" assertion with a guard that the fixture actually contains something it shouldn't see — otherwise `count(all) = count(all)` passes trivially on an empty table.

## Seeds

`db/seed.ts` must be safely re-runnable — it is run on every fresh checkout and in CI.

- Reference data (`categories`, `brands`, `delivery_zones`, `site_config`) uses `upsert` on a natural key (`slug`, `city`, `key`).
- Demo rows use **deterministic uuids** written as literals, so re-seeding updates the same rows instead of accumulating duplicates.
- Seeds run with the service-role key and must not depend on RLS.
- Order of operations: config → categories → brands → zones → users → listings → photos → orders. Anything referencing `auth.users` needs the user created through the auth admin API first, not inserted directly.

Never seed with `Math.random()` or `new Date()` — a seed that produces different data each run makes e2e assertions unwritable.

## Types

```bash
# remote
supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > src/types/database.ts
# local
supabase gen types typescript --db-url "$DATABASE_URL" > src/types/database.ts
```

Run after **every** migration and commit the result in the same commit as the migration. A generated type file that lags its schema is worse than no types — it type-checks against a table shape that no longer exists.

Client construction is always `createClient<Database>(…)`; an untyped client silently returns `any` and every downstream guarantee evaporates.

## Query conventions

- All queries live in `src/lib/db/` repository modules, never inline in components. One place to enforce safe projections and to test query shapes.
- **Never expose a `SECURITY DEFINER` function in `public`.** Supabase publishes everything in `public` as `/rest/v1/rpc/<name>`, and Postgres grants EXECUTE to PUBLIC by default — so a guarded state-machine function is an anonymous endpoint unless you revoke it. Mutating definer functions get `revoke all from public, anon, authenticated` plus `grant execute to service_role`; RLS predicate helpers live in a non-exposed `private` schema. Run `get_advisors(type: 'security')` after every DDL change. `[D-44]`
- Select explicit column lists. `select('*')` on `listings` returns `pickup_street`.
- Filter by indexed columns; every column used in a `where` on a hot path (`status`, `category_id`, `pickup_city`, `slug`, `seller_id`, `buyer_id`) has an index, and status filters use a partial index on `active` since that's the overwhelming majority of catalogue reads.
- Prefer one query with an embedded resource (`listings(*, listing_photos(*))`) over N+1 round trips.
- **Name the foreign key when two tables reference each other in both directions.** `orders.listing_id → listings.id` and `listings.resale_source_order_id → orders.id` both exist, so `orders.select('…, listings(…)')` fails with *"Could not embed because more than one relationship was found"*. Write `listings!orders_listing_id_fkey(…)`. The `!hint` disambiguates without renaming the response key, so consumers are unaffected. This surfaces as an empty result rather than a thrown error if you only destructure `data`, so **always destructure `error` too on an embedded select** — the failure otherwise looks exactly like RLS hiding the row, and you will go looking in the wrong place.
- **Reload PostgREST's schema cache after every migration.** PostgREST reads the catalogue once at start-up and refreshes only on `notify pgrst, 'reload schema'`. Until it does, a newly-added table, column or foreign key does not exist as far as the API is concerned, and an embed naming a fresh FK hint comes back as `PGRST200 … no matches were found` — which, if you dropped `error`, renders as an empty page against a database that visibly contains the rows. `scripts/db-migrate.ts` issues the notify unconditionally, including on a no-op run, because a stale cache outlives the process that created it. Supabase-hosted projects reload automatically on DDL; only the local stack needs this, which is exactly why it bites in tests and not in production.
- **Destructure `error` on every query, including page-level ones.** `const { data } = await …` converts an API failure into an empty list, and an empty list is a plausible-looking UI state. Every read in `src/app/**` and `src/lib/db/**` does `if (error) throw error;` — a 500 with a PostgREST code in it is worth ten minutes of staring at a correct-looking empty page.
- Mutations are Server Actions or route handlers that re-check authorization server-side before touching the database. RLS is the backstop, not the only check. `[D-28]`
