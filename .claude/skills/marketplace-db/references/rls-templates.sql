-- Restyle RLS templates. Copy, rename, adjust column names.
-- Rule: every table in `public` has RLS enabled. A table with no policy is
-- readable by nobody, which is the correct fail-closed default.

-- ---------------------------------------------------------------------------
-- Helpers (create once, in the first migration)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.owns_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from orders
     where id = p_order_id and (buyer_id = auth.uid() or seller_id = auth.uid())
  )
$$;

-- Shared updated_at trigger. Attach to every mutable table. [D-23]
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- 1. PUBLIC REFERENCE DATA — world-readable, admin-writable
--    (categories, brands, delivery_zones)
-- ---------------------------------------------------------------------------

alter table categories enable row level security;

create policy categories_read_all on categories
  for select to anon, authenticated using (true);

create policy categories_admin_write on categories
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 2. PUBLICLY BROWSABLE, OWNER-MANAGED  (listings)
--    Anonymous users see only publicly-visible statuses.
--    Owners see their own rows in every status, including drafts.
-- ---------------------------------------------------------------------------

alter table listings enable row level security;

create policy listings_read_public on listings
  for select to anon, authenticated
  using (status in ('active','reserved','sold'));

create policy listings_read_own on listings
  for select to authenticated
  using (seller_id = auth.uid());

create policy listings_read_admin on listings
  for select to authenticated using (is_admin());

-- Insert: only as yourself, only into a non-live status. A seller cannot
-- self-publish; curation is the brand. [MP 3.2]
create policy listings_insert_own on listings
  for insert to authenticated
  with check (seller_id = auth.uid() and status in ('draft','pending_review'));

-- Update: own rows only, and never into a status the seller isn't allowed to
-- set. Status transitions still go through the transition function; this
-- policy is the backstop for a direct write.
create policy listings_update_own on listings
  for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid()
              and status in ('draft','pending_review','active','removed','expired'));

create policy listings_admin_all on listings
  for all to authenticated using (is_admin()) with check (is_admin());

-- NOTE ON pickup_street: RLS is row-level, not column-level. The address is
-- protected by (a) public repository projections never selecting it, and
-- (b) a dedicated view for the public catalogue. Postgres column privileges
-- add a third layer:
revoke select (pickup_street) on listings from anon;

-- ---------------------------------------------------------------------------
-- 3. CHILD OF A PUBLIC PARENT  (listing_photos)
--    Visibility is inherited — never duplicate the parent's status logic.
-- ---------------------------------------------------------------------------

alter table listing_photos enable row level security;

create policy listing_photos_read on listing_photos
  for select to anon, authenticated
  using (exists (
    select 1 from listings l
     where l.id = listing_photos.listing_id
       and (l.status in ('active','reserved','sold')
            or l.seller_id = auth.uid()
            or is_admin())
  ));

create policy listing_photos_write_own on listing_photos
  for all to authenticated
  using (exists (select 1 from listings l
                  where l.id = listing_photos.listing_id and l.seller_id = auth.uid()))
  with check (exists (select 1 from listings l
                  where l.id = listing_photos.listing_id and l.seller_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. TWO-PARTY PRIVATE ROWS  (orders)
--    Both parties read; neither writes status directly.
-- ---------------------------------------------------------------------------

alter table orders enable row level security;

create policy orders_read_parties on orders
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or is_admin());

-- Buyers create their own orders. Sellers and admins never insert.
create policy orders_insert_buyer on orders
  for insert to authenticated
  with check (buyer_id = auth.uid() and status = 'pending_seller_confirmation');

-- Deliberately NO update policy for authenticated users. Every status change
-- goes through transition_order() (security definer). A missing update policy
-- is the enforcement, not an oversight. [D-04]
create policy orders_admin_update on orders
  for update to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 5. APPEND-ONLY AUDIT  (order_events)
-- ---------------------------------------------------------------------------

alter table order_events enable row level security;

create policy order_events_read_parties on order_events
  for select to authenticated
  using (owns_order(order_id) or is_admin());

create policy order_events_insert on order_events
  for insert to authenticated with check (owns_order(order_id) or is_admin());

-- No update/delete policy at all, plus a hard revoke and a trigger, because
-- RLS does not restrain the table owner or a security-definer function.
revoke update, delete on order_events from anon, authenticated, service_role;

create or replace function public.order_events_immutable() returns trigger
language plpgsql as $$
begin raise exception 'order_events is append-only'; end $$;

create trigger order_events_no_mutate
  before update or delete on order_events
  for each row execute function public.order_events_immutable();

-- ---------------------------------------------------------------------------
-- 6. SINGLE-OWNER ROWS  (favorites, saved_searches)
-- ---------------------------------------------------------------------------

alter table favorites enable row level security;

create policy favorites_own on favorites
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. ADMIN-ONLY OPERATIONAL TABLES  (payouts, deliveries, site_config)
--    Sellers may read their own payouts; nobody but admin writes.
-- ---------------------------------------------------------------------------

alter table payouts enable row level security;

create policy payouts_read_seller on payouts
  for select to authenticated using (seller_id = auth.uid() or is_admin());

create policy payouts_admin_write on payouts
  for all to authenticated using (is_admin()) with check (is_admin());

-- site_config is world-readable (the fee engine needs it client-side) but
-- admin-writable. It must never hold a secret.
alter table site_config enable row level security;
create policy site_config_read on site_config
  for select to anon, authenticated using (true);
create policy site_config_admin_write on site_config
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- 8. STORAGE  (bucket: listing-photos, public read, own-folder write)
--     Path convention: <user_id>/<listing_id>/<filename>
-- ---------------------------------------------------------------------------

create policy "listing photos are publicly readable" on storage.objects
  for select to anon, authenticated using (bucket_id = 'listing-photos');

create policy "users upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users manage own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'listing-photos'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-photos'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- ASSERTION PATTERN for db/rls_test.sql
-- Always assert BOTH directions. A test that only proves the permitted read
-- works will pass against a wide-open table.
-- ---------------------------------------------------------------------------

-- set role to an anonymous request
-- set local role anon;
-- set local request.jwt.claims = '{"role":"anon"}';
--
-- do $$ begin
--   assert (select count(*) from listings where status = 'active') > 0,
--     'anon must see active listings';
--   assert (select count(*) from listings where status = 'draft') = 0,
--     'anon must NOT see draft listings';
--   assert (select count(*) from orders) = 0,
--     'anon must NOT see any order';
-- end $$;
