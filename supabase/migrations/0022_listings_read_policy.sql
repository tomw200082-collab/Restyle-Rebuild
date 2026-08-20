-- 0022 — one SELECT policy on `listings`, and two foreign-key indexes.
--
-- `listings` is the most-read table in the product, and it carried two
-- permissive SELECT policies for `authenticated`: the public-status policy and
-- the own-listings policy. Postgres evaluates every permissive policy for every
-- row and ORs the results, so a signed-in visitor browsing the catalogue paid
-- for both on every row. Merged into one predicate that says the same thing.
--
-- `anon` keeps its own policy: it must never see a draft, and folding the two
-- roles into one policy would mean writing a role check into the predicate.

drop policy if exists listings_read_public on public.listings;
drop policy if exists listings_read_own on public.listings;

-- Anonymous visitors: published statuses only, nothing else, ever.
create policy listings_read_public on public.listings
  for select to anon
  using (status in ('active', 'reserved', 'sold'));

-- Signed-in: the same public set, plus your own listings in any status, plus
-- everything if you are an admin.
create policy listings_read on public.listings
  for select to authenticated
  using (
    status in ('active', 'reserved', 'sold')
    or seller_id = (select auth.uid())
    or (select private.is_admin())
  );

-- Foreign keys with a query behind them. `saved_searches.user_id` is the RLS
-- predicate itself; `orders.offer_id` is followed whenever an offer-backed
-- order is resolved.
--
-- The other unindexed foreign keys — disputes.opened_by, disputes.resolved_by,
-- order_events.actor_id, listings.resale_source_order_id — are deliberately
-- left alone. Nothing joins on them, they exist for referential integrity and
-- for the audit trail, and an index nobody reads still costs every write.
create index if not exists saved_searches_user_idx on public.saved_searches (user_id);
create index if not exists orders_offer_idx on public.orders (offer_id) where offer_id is not null;
