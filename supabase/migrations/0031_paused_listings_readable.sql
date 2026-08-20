-- 0031 — a paused listing must still be readable.
--
-- Found by CI, on the first run of the e2e suite against a real stack.
--
-- 0028 added `paused` to `listing_status` and taught `getListingBySlug` to
-- accept it, because a paused item leaves the catalogue but keeps its URL: the
-- seller stopped answering, the item is likely to come back, and the inbound
-- link it earned is an asset either way. `docs/decisions` [D-33] states the
-- rule as "sold pages never 404", and a paused page is the same argument.
--
-- What 0028 did *not* do is widen the read policies, which still named only
-- active, reserved and sold. So the application asked for a paused listing and
-- RLS returned nothing, and the page 404'd — the exact invariant the spec
-- `a paused item leaves the catalogue but its page still returns 200` exists
-- to defend. The status enum, the query and the policy are three places that
-- have to agree about what "publicly visible" means, and only two of them were
-- changed.
--
-- Widening the policy cannot leak paused items into the catalogue: every list
-- query filters `status` explicitly (`PUBLIC_STATUSES` in src/lib/db/listings.ts,
-- and `eq('status','active')` for the hubs), and only `getListingBySlug` uses
-- the wider `DETAIL_STATUSES`. The policy is the backstop, not the filter. [D-28]

alter policy listings_read on public.listings
  using (
    status = any (array['active', 'reserved', 'sold', 'paused']::public.listing_status[])
    or seller_id = (select auth.uid())
    or (select private.is_admin())
  );

alter policy listings_read_public on public.listings
  using (
    status = any (array['active', 'reserved', 'sold', 'paused']::public.listing_status[])
  );

-- `listing_photos` is embedded in the detail query, so its read policy has to
-- agree or a paused page renders a listing with no photographs. One policy
-- serves both roles here, and it also carries the seller-owns-it and admin
-- clauses — they are restated verbatim, because `alter policy ... using`
-- replaces the whole expression rather than adding to it.
alter policy listing_photos_read on public.listing_photos
  using (exists (
    select 1
      from public.listings l
     where l.id = listing_photos.listing_id
       and (
         l.status = any (array['active', 'reserved', 'sold', 'paused']::public.listing_status[])
         or l.seller_id = (select auth.uid())
         or (select private.is_admin())
       )
  ));
