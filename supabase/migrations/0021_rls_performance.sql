-- 0021 — RLS policy performance. No behaviour change; the permission set before
-- and after this migration is identical, and db/rls_test.sql proves it.
--
-- Two problems, both flagged by Supabase's own performance advisor, and both
-- on the hottest read path in the product.
--
--   1. `auth.uid()` and `private.is_admin()` written bare are re-evaluated
--      **per row**. Wrapping each as `(select …)` makes Postgres hoist it into
--      an InitPlan evaluated once per query. On a catalogue scan that is the
--      difference between one function call and one per listing.
--
--   2. Every table carried a user-facing SELECT policy *and* an admin
--      `for all` policy, so Postgres evaluated both permissive policies for
--      every row on every read. Each read policy already admits admins — via
--      `using (true)` or an explicit `or private.is_admin()` — so the admin
--      policy contributed nothing on SELECT and cost an evaluation.
--      It is therefore scoped to writes.
--
-- Postgres has no `for insert, update, delete`, so one `for all` becomes three
-- single-command policies. That is more policy objects and strictly fewer
-- evaluations, because only one of the three can apply to any given statement.

-- ---------------------------------------------------------------------------
-- Reference data — world readable, admin writable
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories', 'brands', 'delivery_zones', 'legacy_redirects']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',
      t || '_admin_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || '_admin_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))',
      t || '_admin_delete', t);
  end loop;
end $$;

-- site_config keeps a filtered read, so it is rebuilt explicitly.
drop policy if exists site_config_read on public.site_config;
create policy site_config_read on public.site_config
  for select to anon, authenticated using (is_public or (select private.is_admin()));

drop policy if exists site_config_admin on public.site_config;
create policy site_config_admin_insert on public.site_config
  for insert to authenticated with check ((select private.is_admin()));
create policy site_config_admin_update on public.site_config
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy site_config_admin_delete on public.site_config
  for delete to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated with check ((select private.is_admin()));
create policy profiles_admin_delete on public.profiles
  for delete to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------
drop policy if exists listings_read_own on public.listings;
create policy listings_read_own on public.listings
  for select to authenticated
  using (seller_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists listings_insert_own on public.listings;
create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (
    (select private.is_admin())
    or (seller_id = (select auth.uid()) and status in ('draft', 'pending_review'))
  );

drop policy if exists listings_update_own on public.listings;
create policy listings_update_own on public.listings
  for update to authenticated
  using (seller_id = (select auth.uid()) or (select private.is_admin()))
  with check (
    (select private.is_admin())
    or (seller_id = (select auth.uid())
        and status in ('draft', 'pending_review', 'active', 'removed', 'expired'))
  );

drop policy if exists listings_admin on public.listings;
create policy listings_admin_delete on public.listings
  for delete to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- listing_photos
-- ---------------------------------------------------------------------------
drop policy if exists listing_photos_read on public.listing_photos;
create policy listing_photos_read on public.listing_photos
  for select to anon, authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_photos.listing_id
                    and (l.status in ('active', 'reserved', 'sold')
                         or l.seller_id = (select auth.uid())
                         or (select private.is_admin()))));

drop policy if exists listing_photos_write_own on public.listing_photos;
do $$
declare cmd text;
begin
  foreach cmd in array array['insert', 'update', 'delete']
  loop
    execute format(
      'create policy %I on public.listing_photos for %s to authenticated %s',
      'listing_photos_' || cmd || '_own',
      cmd,
      case cmd
        when 'insert' then
          'with check (exists (select 1 from public.listings l where l.id = listing_photos.listing_id and (l.seller_id = (select auth.uid()) or (select private.is_admin()))))'
        when 'update' then
          'using (exists (select 1 from public.listings l where l.id = listing_photos.listing_id and (l.seller_id = (select auth.uid()) or (select private.is_admin())))) '
          || 'with check (exists (select 1 from public.listings l where l.id = listing_photos.listing_id and (l.seller_id = (select auth.uid()) or (select private.is_admin()))))'
        else
          'using (exists (select 1 from public.listings l where l.id = listing_photos.listing_id and (l.seller_id = (select auth.uid()) or (select private.is_admin()))))'
      end);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- offers
-- ---------------------------------------------------------------------------
drop policy if exists offers_read_parties on public.offers;
create policy offers_read_parties on public.offers
  for select to authenticated
  using (buyer_id = (select auth.uid())
         or (select private.is_admin())
         or exists (select 1 from public.listings l
                     where l.id = offers.listing_id and l.seller_id = (select auth.uid())));

drop policy if exists offers_update_parties on public.offers;
create policy offers_update_parties on public.offers
  for update to authenticated
  using (buyer_id = (select auth.uid())
         or (select private.is_admin())
         or exists (select 1 from public.listings l
                     where l.id = offers.listing_id and l.seller_id = (select auth.uid())));

drop policy if exists offers_insert_buyer on public.offers;
create policy offers_insert_buyer on public.offers
  for insert to authenticated with check (buyer_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- orders, deliveries, payouts, disputes, order_events
-- ---------------------------------------------------------------------------
drop policy if exists orders_read_parties on public.orders;
create policy orders_read_parties on public.orders
  for select to authenticated
  using (buyer_id = (select auth.uid())
         or seller_id = (select auth.uid())
         or (select private.is_admin()));

drop policy if exists orders_admin_write on public.orders;
create policy orders_admin_insert on public.orders
  for insert to authenticated with check ((select private.is_admin()));
create policy orders_admin_update on public.orders
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy orders_admin_delete on public.orders
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists deliveries_read_parties on public.deliveries;
create policy deliveries_read_parties on public.deliveries
  for select to authenticated
  using ((select private.owns_order(order_id)) or (select private.is_admin()));

drop policy if exists deliveries_admin on public.deliveries;
create policy deliveries_admin_insert on public.deliveries
  for insert to authenticated with check ((select private.is_admin()));
create policy deliveries_admin_update on public.deliveries
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy deliveries_admin_delete on public.deliveries
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists payouts_read_seller on public.payouts;
create policy payouts_read_seller on public.payouts
  for select to authenticated
  using (seller_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists payouts_admin on public.payouts;
create policy payouts_admin_insert on public.payouts
  for insert to authenticated with check ((select private.is_admin()));
create policy payouts_admin_update on public.payouts
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy payouts_admin_delete on public.payouts
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists disputes_read_parties on public.disputes;
create policy disputes_read_parties on public.disputes
  for select to authenticated
  using ((select private.owns_order(order_id)) or (select private.is_admin()));

drop policy if exists disputes_insert_buyer on public.disputes;
create policy disputes_insert_buyer on public.disputes
  for insert to authenticated
  with check ((select private.owns_order(order_id)) or (select private.is_admin()));

drop policy if exists disputes_admin on public.disputes;
create policy disputes_admin_update on public.disputes
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy disputes_admin_delete on public.disputes
  for delete to authenticated using ((select private.is_admin()));

drop policy if exists order_events_read on public.order_events;
create policy order_events_read on public.order_events
  for select to authenticated
  using ((select private.owns_order(order_id)) or (select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Per-user tables. These stay `for all`: the same predicate governs reading
-- and writing, and there is no second policy to overlap with.
-- ---------------------------------------------------------------------------
drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists saved_searches_own on public.saved_searches;
create policy saved_searches_own on public.saved_searches
  for all to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists outbound_events_admin on public.outbound_events;
create policy outbound_events_admin on public.outbound_events
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
