-- 0016 — make the seller's street address unreadable through the API.
--
-- 0011 tried `revoke select (pickup_street) ... from anon`, which is inert:
-- in Postgres a table-level SELECT grant covers every column, and a
-- column-level revoke cannot subtract from it. The only mechanism that works
-- is to revoke the table-level grant and re-grant column by column.
--
-- Testing that revealed the larger hole: the table-level grant also applied to
-- `authenticated`, so **any signed-in user could read every seller's home
-- address** for any publicly-visible listing — the same class of defect the
-- legacy platform had, arriving by a different route. [LI 1], [D-06]
--
-- After this migration `pickup_street` is readable only by `service_role`.
-- The address is revealed through server-side code paths that check
-- authorization first (admin manifest, and the buyer of a paid order), which
-- is the rule stated in [D-28]: RLS is the backstop, not the only check.
--
-- The column list is enumerated at migration time rather than hardcoded, so
-- this cannot drift. A column added by a later migration is simply not granted
-- — it fails closed, which is the correct direction.

do $$
declare v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'listings'
     and column_name <> 'pickup_street';

  execute 'revoke select on public.listings from anon, authenticated';
  execute format('grant select (%s) on public.listings to anon, authenticated', v_cols);

  -- Writes are unaffected: RLS still decides which rows a seller may touch,
  -- and a seller must be able to set their own pickup address.
  execute 'grant insert, update, delete on public.listings to authenticated';
end $$;

-- Default privileges granted `all` on future tables to anon/authenticated in
-- some environments; make sure the service role keeps full access.
grant select on public.listings to service_role;
