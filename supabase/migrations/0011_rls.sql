-- 0011 — Row Level Security, on every table, with no exceptions.
-- The system this replaces had none: "there is no row-level isolation
-- anywhere", so any authenticated user could read every order and every
-- seller's home address. [LI 1], [D-31]

-- site_config holds one non-public key (admin_email), so reads are filtered
-- rather than blanket-public.
alter table public.site_config add column if not exists is_public boolean not null default true;

-- ---------------------------------------------------------------------------
-- Reference data — world readable, admin writable
-- ---------------------------------------------------------------------------
alter table public.categories      enable row level security;
alter table public.brands          enable row level security;
alter table public.delivery_zones  enable row level security;
alter table public.site_config     enable row level security;

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories
  for select to anon, authenticated using (true);
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists brands_read on public.brands;
create policy brands_read on public.brands
  for select to anon, authenticated using (true);
drop policy if exists brands_admin on public.brands;
create policy brands_admin on public.brands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists delivery_zones_read on public.delivery_zones;
create policy delivery_zones_read on public.delivery_zones
  for select to anon, authenticated using (true);
drop policy if exists delivery_zones_admin on public.delivery_zones;
create policy delivery_zones_admin on public.delivery_zones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists site_config_read on public.site_config;
create policy site_config_read on public.site_config
  for select to anon, authenticated using (is_public or public.is_admin());
drop policy if exists site_config_admin on public.site_config;
create policy site_config_admin on public.site_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Transition tables are read-only reference data; nobody edits the legal graph
-- at runtime.
alter table public.listing_status_transitions enable row level security;
alter table public.order_status_transitions   enable row level security;
drop policy if exists listing_transitions_read on public.listing_status_transitions;
create policy listing_transitions_read on public.listing_status_transitions
  for select to anon, authenticated using (true);
drop policy if exists order_transitions_read on public.order_status_transitions;
create policy order_transitions_read on public.order_status_transitions
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- profiles — you see yourself; admins see everyone.
-- Public seller identity (first name + initial) is exposed through the
-- listings join in the repository layer, never by opening this table up.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------
alter table public.listings enable row level security;

drop policy if exists listings_read_public on public.listings;
create policy listings_read_public on public.listings
  for select to anon, authenticated
  using (status in ('active', 'reserved', 'sold'));

drop policy if exists listings_read_own on public.listings;
create policy listings_read_own on public.listings
  for select to authenticated using (seller_id = auth.uid() or public.is_admin());

-- A seller may create only their own listing, and never straight into a live
-- status: every listing passes curation. [MP 3.2]
drop policy if exists listings_insert_own on public.listings;
create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (seller_id = auth.uid() and status in ('draft', 'pending_review'));

drop policy if exists listings_update_own on public.listings;
create policy listings_update_own on public.listings
  for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid()
              and status in ('draft', 'pending_review', 'active', 'removed', 'expired'));

drop policy if exists listings_admin on public.listings;
create policy listings_admin on public.listings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Third layer on the address, beneath the safe projections and RLS: anonymous
-- clients have no column privilege on it at all. [D-06]
revoke select (pickup_street) on public.listings from anon;

-- ---------------------------------------------------------------------------
-- listing_photos — visibility inherited from the parent listing
-- ---------------------------------------------------------------------------
alter table public.listing_photos enable row level security;

drop policy if exists listing_photos_read on public.listing_photos;
create policy listing_photos_read on public.listing_photos
  for select to anon, authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_photos.listing_id
                    and (l.status in ('active', 'reserved', 'sold')
                         or l.seller_id = auth.uid()
                         or public.is_admin())));

drop policy if exists listing_photos_write_own on public.listing_photos;
create policy listing_photos_write_own on public.listing_photos
  for all to authenticated
  using (exists (select 1 from public.listings l
                  where l.id = listing_photos.listing_id
                    and (l.seller_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.listings l
                  where l.id = listing_photos.listing_id
                    and (l.seller_id = auth.uid() or public.is_admin())));

-- ---------------------------------------------------------------------------
-- offers — buyer and the listing's seller
-- ---------------------------------------------------------------------------
alter table public.offers enable row level security;

drop policy if exists offers_read_parties on public.offers;
create policy offers_read_parties on public.offers
  for select to authenticated
  using (buyer_id = auth.uid()
         or public.is_admin()
         or exists (select 1 from public.listings l
                     where l.id = offers.listing_id and l.seller_id = auth.uid()));

drop policy if exists offers_insert_buyer on public.offers;
create policy offers_insert_buyer on public.offers
  for insert to authenticated
  with check (buyer_id = auth.uid() and status = 'pending');

-- The seller responds (accept / decline / counter); the buyer may withdraw.
drop policy if exists offers_update_parties on public.offers;
create policy offers_update_parties on public.offers
  for update to authenticated
  using (buyer_id = auth.uid()
         or public.is_admin()
         or exists (select 1 from public.listings l
                     where l.id = offers.listing_id and l.seller_id = auth.uid()))
  with check (true);

-- ---------------------------------------------------------------------------
-- orders — both parties read; nobody writes status directly.
-- The absence of an update policy for ordinary users IS the enforcement:
-- every status change goes through transition_order(). [D-04]
-- ---------------------------------------------------------------------------
alter table public.orders enable row level security;

drop policy if exists orders_read_parties on public.orders;
create policy orders_read_parties on public.orders
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

drop policy if exists orders_admin_write on public.orders;
create policy orders_admin_write on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- order_events — append only
-- ---------------------------------------------------------------------------
alter table public.order_events enable row level security;

drop policy if exists order_events_read on public.order_events;
create policy order_events_read on public.order_events
  for select to authenticated
  using (public.owns_order(order_id) or public.is_admin());

drop policy if exists order_events_insert on public.order_events;
create policy order_events_insert on public.order_events
  for insert to authenticated
  with check (public.owns_order(order_id) or public.is_admin());

-- RLS does not restrain the table owner or a security-definer function, so the
-- revoke and the trigger in 0006 are the layers that actually hold. [D-05]
revoke update, delete on public.order_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- deliveries / payouts / disputes
-- ---------------------------------------------------------------------------
alter table public.deliveries enable row level security;
drop policy if exists deliveries_read_parties on public.deliveries;
create policy deliveries_read_parties on public.deliveries
  for select to authenticated using (public.owns_order(order_id) or public.is_admin());
drop policy if exists deliveries_admin on public.deliveries;
create policy deliveries_admin on public.deliveries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.payouts enable row level security;
drop policy if exists payouts_read_seller on public.payouts;
create policy payouts_read_seller on public.payouts
  for select to authenticated using (seller_id = auth.uid() or public.is_admin());
drop policy if exists payouts_admin on public.payouts;
create policy payouts_admin on public.payouts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.disputes enable row level security;
drop policy if exists disputes_read_parties on public.disputes;
create policy disputes_read_parties on public.disputes
  for select to authenticated using (public.owns_order(order_id) or public.is_admin());
drop policy if exists disputes_insert_buyer on public.disputes;
create policy disputes_insert_buyer on public.disputes
  for insert to authenticated
  with check (opened_by = auth.uid() and public.owns_order(order_id) and status = 'open');
drop policy if exists disputes_admin on public.disputes;
create policy disputes_admin on public.disputes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- favorites / saved_searches — single owner
-- ---------------------------------------------------------------------------
alter table public.favorites enable row level security;
drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.saved_searches enable row level security;
drop policy if exists saved_searches_own on public.saved_searches;
create policy saved_searches_own on public.saved_searches
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- outbound_events — admin only. Contains recipient addresses.
-- ---------------------------------------------------------------------------
alter table public.outbound_events enable row level security;
drop policy if exists outbound_events_admin on public.outbound_events;
create policy outbound_events_admin on public.outbound_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- legacy_redirects — world readable (the redirect middleware reads it before
-- any session exists), admin writable.
-- ---------------------------------------------------------------------------
alter table public.legacy_redirects enable row level security;
drop policy if exists legacy_redirects_read on public.legacy_redirects;
create policy legacy_redirects_read on public.legacy_redirects
  for select to anon, authenticated using (true);
drop policy if exists legacy_redirects_admin on public.legacy_redirects;
create policy legacy_redirects_admin on public.legacy_redirects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
