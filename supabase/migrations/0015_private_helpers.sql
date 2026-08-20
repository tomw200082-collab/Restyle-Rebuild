-- 0015 — move the RLS predicate helpers out of the API-exposed schema.
--
-- is_admin() and owns_order() must remain SECURITY DEFINER (is_admin reads
-- profiles, and the profiles read policy references is_admin — as SECURITY
-- INVOKER that is infinite policy recursion) and must remain executable by
-- anon and authenticated, because RLS policy expressions are evaluated with
-- the caller's privileges.
--
-- Anything in `public` is published by PostgREST as /rest/v1/rpc/<name>, so
-- while these two disclose nothing (they answer "am I an admin" and "is this
-- my order", both about the caller), leaving definer functions on the public
-- API surface is a standing footgun: a later signature or body change silently
-- inherits the exposure. `private` is not an exposed schema, so RLS can call
-- them and the REST API cannot. [D-44]

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function private.owns_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.orders
     where id = p_order_id and (buyer_id = auth.uid() or seller_id = auth.uid())
  )
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.owns_order(uuid) from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.owns_order(uuid) to anon, authenticated, service_role;

-- Repoint every policy. Same predicates, private schema.
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists brands_admin on public.brands;
create policy brands_admin on public.brands
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists delivery_zones_admin on public.delivery_zones;
create policy delivery_zones_admin on public.delivery_zones
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists site_config_read on public.site_config;
create policy site_config_read on public.site_config
  for select to anon, authenticated using (is_public or private.is_admin());
drop policy if exists site_config_admin on public.site_config;
create policy site_config_admin on public.site_config
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select to authenticated using (id = auth.uid() or private.is_admin());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists listings_read_own on public.listings;
create policy listings_read_own on public.listings
  for select to authenticated using (seller_id = auth.uid() or private.is_admin());
drop policy if exists listings_admin on public.listings;
create policy listings_admin on public.listings
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists listing_photos_read on public.listing_photos;
create policy listing_photos_read on public.listing_photos
  for select to anon, authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_photos.listing_id
                    and (l.status in ('active', 'reserved', 'sold')
                         or l.seller_id = auth.uid()
                         or private.is_admin())));
drop policy if exists listing_photos_write_own on public.listing_photos;
create policy listing_photos_write_own on public.listing_photos
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_photos.listing_id
                    and (l.seller_id = auth.uid() or private.is_admin())))
  with check (exists (select 1 from public.listings l
                  where l.id = listing_photos.listing_id
                    and (l.seller_id = auth.uid() or private.is_admin())));

drop policy if exists offers_read_parties on public.offers;
create policy offers_read_parties on public.offers
  for select to authenticated
  using (buyer_id = auth.uid()
         or private.is_admin()
         or exists (select 1 from public.listings l
                     where l.id = offers.listing_id and l.seller_id = auth.uid()));
drop policy if exists offers_update_parties on public.offers;
create policy offers_update_parties on public.offers
  for update to authenticated
  using (buyer_id = auth.uid()
         or private.is_admin()
         or exists (select 1 from public.listings l
                     where l.id = offers.listing_id and l.seller_id = auth.uid()))
  with check (true);

drop policy if exists orders_read_parties on public.orders;
create policy orders_read_parties on public.orders
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or private.is_admin());
drop policy if exists orders_admin_write on public.orders;
create policy orders_admin_write on public.orders
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists order_events_read on public.order_events;
create policy order_events_read on public.order_events
  for select to authenticated
  using (private.owns_order(order_id) or private.is_admin());
drop policy if exists order_events_insert on public.order_events;
create policy order_events_insert on public.order_events
  for insert to authenticated
  with check (private.owns_order(order_id) or private.is_admin());

drop policy if exists deliveries_read_parties on public.deliveries;
create policy deliveries_read_parties on public.deliveries
  for select to authenticated using (private.owns_order(order_id) or private.is_admin());
drop policy if exists deliveries_admin on public.deliveries;
create policy deliveries_admin on public.deliveries
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists payouts_read_seller on public.payouts;
create policy payouts_read_seller on public.payouts
  for select to authenticated using (seller_id = auth.uid() or private.is_admin());
drop policy if exists payouts_admin on public.payouts;
create policy payouts_admin on public.payouts
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists disputes_read_parties on public.disputes;
create policy disputes_read_parties on public.disputes
  for select to authenticated using (private.owns_order(order_id) or private.is_admin());
drop policy if exists disputes_insert_buyer on public.disputes;
create policy disputes_insert_buyer on public.disputes
  for insert to authenticated
  with check (opened_by = auth.uid() and private.owns_order(order_id) and status = 'open');
drop policy if exists disputes_admin on public.disputes;
create policy disputes_admin on public.disputes
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists saved_searches_own on public.saved_searches;
create policy saved_searches_own on public.saved_searches
  for all to authenticated
  using (user_id = auth.uid() or private.is_admin())
  with check (user_id = auth.uid() or private.is_admin());

drop policy if exists outbound_events_admin on public.outbound_events;
create policy outbound_events_admin on public.outbound_events
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists legacy_redirects_admin on public.legacy_redirects;
create policy legacy_redirects_admin on public.legacy_redirects
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop function if exists public.is_admin();
drop function if exists public.owns_order(uuid);
