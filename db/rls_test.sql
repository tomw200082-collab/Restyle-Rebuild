-- RLS assertions. Runs in Gate 1 and in CI; a policy regression fails the build.
--
-- Every policy is asserted in BOTH directions: the permitted read returns rows
-- AND the forbidden read returns zero. A suite that only proves the happy path
-- passes against a wide-open table — which is exactly the state the system this
-- replaces was in. [LI 1], [D-31]
--
-- Roles are switched with `set local role` inside a transaction, and the JWT
-- claims PostgREST would set are set the same way, so these run against the
-- same code path the REST API uses.

\set ON_ERROR_STOP on

\set admin_id   '00000000-0000-4000-8000-000000000001'
\set seller_id  '00000000-0000-4000-8000-000000000002'
\set buyer_id   '00000000-0000-4000-8000-000000000003'
\set seller2_id '00000000-0000-4000-8000-000000000004'

-- ===========================================================================
-- ANONYMOUS
-- ===========================================================================
-- Expected counts are captured as the table owner BEFORE switching roles,
-- never hardcoded. The e2e suite creates real listings, so a literal "= 30"
-- turns this suite into something that fails for reasons unrelated to RLS.
begin;
create temp table expected on commit drop as
select
  (select count(*) from public.listings where status = 'active')          as active,
  (select count(*) from public.listings where status = 'sold')            as sold,
  (select count(*) from public.listings)                                  as all_listings,
  (select count(*) from public.categories)                                as categories,
  (select count(*) from public.delivery_zones)                            as zones,
  (select count(*) from public.legacy_redirects)                          as redirects,
  (select count(*) from public.profiles)                                  as profiles,
  (select count(*) from public.listings
    where seller_id = '00000000-0000-4000-8000-000000000002'
      and status = 'draft')                                               as seller_drafts,
  (select count(*) from public.listings
    where seller_id = '00000000-0000-4000-8000-000000000004'
      and status = 'draft')                                               as seller2_drafts;
grant select on expected to anon, authenticated;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  assert (select active from expected) > 0, 'the seed must provide active listings to test with';

  assert (select count(*) from public.listings where status = 'active')
         = (select active from expected),
    'anon must see every active listing';
  assert (select count(*) from public.listings where status = 'sold')
         = (select sold from expected),
    'anon must see sold listings — they stay live as an SEO asset';
  assert (select count(*) from public.listings where status = 'draft') = 0,
    'anon must NOT see draft listings';
  assert (select count(*) from public.listings where status = 'pending_review') = 0,
    'anon must NOT see listings awaiting review';
  assert (select count(*) from public.listings where status = 'rejected') = 0,
    'anon must NOT see rejected listings';
  assert (select count(*) from public.listings where status = 'expired') = 0,
    'anon must NOT see expired listings';

  assert (select count(*) from public.orders) = 0,        'anon must NOT see orders';
  assert (select count(*) from public.offers) = 0,        'anon must NOT see offers';
  assert (select count(*) from public.order_events) = 0,  'anon must NOT see order events';
  assert (select count(*) from public.payouts) = 0,       'anon must NOT see payouts';
  assert (select count(*) from public.disputes) = 0,      'anon must NOT see disputes';
  assert (select count(*) from public.deliveries) = 0,    'anon must NOT see deliveries';
  assert (select count(*) from public.profiles) = 0,      'anon must NOT see profiles';
  assert (select count(*) from public.favorites) = 0,     'anon must NOT see favourites';
  assert (select count(*) from public.outbound_events) = 0, 'anon must NOT see outbound events';

  -- Reference data anon legitimately needs.
  assert (select count(*) from public.categories) = (select categories from expected),
    'anon must see categories';
  assert (select count(*) from public.delivery_zones) = (select zones from expected),
    'anon must see delivery zones';
  assert (select count(*) from public.legacy_redirects) = (select redirects from expected),
    'anon must see legacy redirects (the middleware runs before any session exists)';

  -- site_config is public except the keys marked otherwise.
  assert (select count(*) from public.site_config where key = 'commission_pct') = 1,
    'anon must see the public fee config';
  assert (select count(*) from public.site_config where key = 'admin_email') = 0,
    'anon must NOT see admin_email';
end $$;
rollback;

-- The seller's street address is not merely filtered — no API role holds a
-- column privilege on it, so a `select *` that forgets to exclude it errors
-- rather than leaking every seller's home address.
--
-- `authenticated` is asserted as well as `anon`, and that is the point: a
-- signed-in buyer can legitimately read any active listing's ROW, so row-level
-- security alone would have handed them the address. [D-06]
begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform pickup_street from public.listings limit 1;
    raise exception 'anon was able to read listings.pickup_street';
  exception
    when insufficient_privilege then null;  -- expected
  end;
end $$;
rollback;

begin;
create temp table expected_auth on commit drop as
  select (select count(*) from public.listings where status = 'active') as active;
grant select on expected_auth to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003"}';
do $$
begin
  begin
    perform pickup_street from public.listings limit 1;
    raise exception 'a signed-in user was able to read another seller''s pickup_street';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  -- ...while the public columns of the same rows stay readable.
  assert (select count(*) from (select id, title, pickup_city
                                  from public.listings where status = 'active') x)
         = (select active from expected_auth),
    'restricting the address column must not break normal catalogue reads';
end $$;
rollback;

-- The guarded state machine must not be reachable from the REST API. [D-44]
begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform public.transition_order('00000000-0000-0000-0000-000000000000'::uuid, 'completed');
    raise exception 'anon was able to call transition_order';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  begin
    perform public.transition_listing('00000000-0000-0000-0000-000000000000'::uuid, 'active');
    raise exception 'anon was able to call transition_listing';
  exception
    when insufficient_privilege then null;  -- expected
  end;
end $$;
rollback;

-- ===========================================================================
-- SELLER
-- ===========================================================================
begin;
create temp table expected_seller on commit drop as
select
  (select count(*) from public.listings where status = 'active') as active,
  (select count(*) from public.listings
    where seller_id = '00000000-0000-4000-8000-000000000002' and status = 'draft') as own_drafts;
grant select on expected_seller to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}';

do $$
begin
  assert (select own_drafts from expected_seller) > 0,
    'the seed must give this seller a draft to test with';
  assert (select count(*) from public.listings
           where seller_id = '00000000-0000-4000-8000-000000000002' and status = 'draft')
         = (select own_drafts from expected_seller),
    'seller must see their own drafts';
  assert (select count(*) from public.listings
           where seller_id = '00000000-0000-4000-8000-000000000004' and status = 'draft') = 0,
    'seller must NOT see another seller''s draft';
  assert (select count(*) from public.listings
           where seller_id = '00000000-0000-4000-8000-000000000004' and status = 'pending_review') = 0,
    'seller must NOT see another seller''s pending listing';

  -- Public statuses stay visible to everyone, including other sellers.
  assert (select count(*) from public.listings where status = 'active')
         = (select active from expected_seller),
    'seller must still see the public catalogue';

  assert (select count(*) from public.profiles) = 1,
    'seller must see exactly one profile — their own';
  assert (select id from public.profiles) = '00000000-0000-4000-8000-000000000002',
    'the visible profile must be the seller''s own';

  assert (select count(*) from public.site_config where key = 'admin_email') = 0,
    'a non-admin must NOT see admin_email';
end $$;
rollback;

-- A seller cannot publish their own listing: curation is not optional.
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}';
do $$
begin
  begin
    insert into public.listings (
      slug, seller_id, title, description, category_id, condition,
      width_cm, depth_cm, height_cm, price_agorot, status, pickup_city
    ) values (
      'rls-probe-selfpublish', '00000000-0000-4000-8000-000000000002',
      'ניסיון פרסום עצמי', '', (select id from public.categories limit 1), 'good',
      10, 10, 10, 10000, 'active', 'תל אביב-יפו'
    );
    raise exception 'seller was able to insert a listing directly into active';
  exception
    when insufficient_privilege then null;  -- expected
  end;

  -- ...but may create a listing for review.
  insert into public.listings (
    slug, seller_id, title, description, category_id, condition,
    width_cm, depth_cm, height_cm, price_agorot, status, pickup_city
  ) values (
    'rls-probe-pending', '00000000-0000-4000-8000-000000000002',
    'ניסיון פרסום תקין', '', (select id from public.categories limit 1), 'good',
    10, 10, 10, 10000, 'pending_review', 'תל אביב-יפו'
  );
end $$;
rollback;

-- A seller cannot create a listing owned by somebody else.
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002"}';
do $$
begin
  begin
    insert into public.listings (
      slug, seller_id, title, description, category_id, condition,
      width_cm, depth_cm, height_cm, price_agorot, status, pickup_city
    ) values (
      'rls-probe-impersonate', '00000000-0000-4000-8000-000000000004',
      'התחזות למוכר אחר', '', (select id from public.categories limit 1), 'good',
      10, 10, 10, 10000, 'pending_review', 'תל אביב-יפו'
    );
    raise exception 'seller was able to create a listing owned by another seller';
  exception
    when insufficient_privilege then null;  -- expected
  end;
end $$;
rollback;

-- ===========================================================================
-- ADMIN
-- ===========================================================================
begin;
create temp table expected_admin on commit drop as
select
  (select count(*) from public.listings) as all_listings,
  (select count(*) from public.profiles) as profiles;
grant select on expected_admin to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}';

do $$
begin
  assert (select count(*) from public.listings) = (select all_listings from expected_admin),
    'admin must see every listing in every status';
  assert (select count(*) from public.listings where status = 'draft') > 0,
    'the fixture must include non-public listings, or the assertion above proves nothing';
  assert (select count(*) from public.profiles) = (select profiles from expected_admin),
    'admin must see every profile';
  assert (select count(*) from public.site_config where key = 'admin_email') = 1,
    'admin must see admin_email';
end $$;
rollback;

-- ===========================================================================
-- APPEND-ONLY AUDIT
-- ===========================================================================
-- Asserted as the table owner, because RLS does not restrain the owner: if the
-- trigger holds here it holds for everyone. [D-05]
begin;
do $$
declare v_order_id uuid;
begin
  insert into public.orders (
    listing_id, buyer_id, seller_id, item_agorot, delivery_agorot,
    surcharges_agorot, total_agorot, commission_agorot, seller_payout_agorot,
    delivery_method, dropoff_city, dropoff_street
  ) values (
    (select id from public.listings where status = 'active' limit 1),
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000002',
    100000, 14900, 0, 114900, 20000, 80000,
    'platform', 'תל אביב-יפו', 'רחוב הבדיקה 1'
  ) returning id into v_order_id;

  insert into public.order_events (order_id, type, payload)
  values (v_order_id, 'rls_probe', '{}'::jsonb);

  begin
    update public.order_events set type = 'tampered' where order_id = v_order_id;
    raise exception 'order_events was updatable';
  exception
    when check_violation then null;  -- expected: raised by the immutability trigger
  end;

  begin
    delete from public.order_events where order_id = v_order_id;
    raise exception 'order_events was deletable';
  exception
    when check_violation then null;  -- expected
  end;
end $$;
rollback;

-- ===========================================================================
-- MONEY INVARIANTS
-- ===========================================================================
begin;
do $$
declare v_listing uuid := (select id from public.listings where status = 'active' limit 1);
begin
  -- commission + payout must equal the item price.
  begin
    insert into public.orders (
      listing_id, buyer_id, seller_id, item_agorot, delivery_agorot,
      surcharges_agorot, total_agorot, commission_agorot, seller_payout_agorot,
      delivery_method, dropoff_city, dropoff_street
    ) values (
      v_listing, '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
      100000, 14900, 0, 114900, 20000, 70000,   -- 20000 + 70000 <> 100000
      'platform', 'תל אביב-יפו', 'רחוב הבדיקה 1'
    );
    raise exception 'an order whose commission and payout do not sum to the item price was accepted';
  exception
    when check_violation then null;  -- expected
  end;

  -- total must equal item + delivery + surcharges.
  begin
    insert into public.orders (
      listing_id, buyer_id, seller_id, item_agorot, delivery_agorot,
      surcharges_agorot, total_agorot, commission_agorot, seller_payout_agorot,
      delivery_method, dropoff_city, dropoff_street
    ) values (
      v_listing, '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
      100000, 14900, 0, 999999, 20000, 80000,   -- total is wrong
      'platform', 'תל אביב-יפו', 'רחוב הבדיקה 1'
    );
    raise exception 'an order whose total does not equal its parts was accepted';
  exception
    when check_violation then null;  -- expected
  end;

  -- self-pickup must carry no delivery charges at all. [D-08]
  begin
    insert into public.orders (
      listing_id, buyer_id, seller_id, item_agorot, delivery_agorot,
      surcharges_agorot, total_agorot, commission_agorot, seller_payout_agorot,
      delivery_method
    ) values (
      v_listing, '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
      100000, 14900, 0, 114900, 20000, 80000,
      'self_pickup'
    );
    raise exception 'a self-pickup order was accepted with a delivery fee';
  exception
    when check_violation then null;  -- expected
  end;
end $$;
rollback;

-- ===========================================================================
-- STATE MACHINE
-- ===========================================================================
begin;
do $$
declare
  v_listing uuid := (select id from public.listings where status = 'active' limit 1);
  v_order   uuid;
begin
  insert into public.orders (
    listing_id, buyer_id, seller_id, item_agorot, delivery_agorot,
    surcharges_agorot, total_agorot, commission_agorot, seller_payout_agorot,
    delivery_method, dropoff_city, dropoff_street
  ) values (
    v_listing, '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000002',
    100000, 14900, 0, 114900, 20000, 80000,
    'platform', 'תל אביב-יפו', 'רחוב הבדיקה 1'
  ) returning id into v_order;

  -- Skipping states is impossible.
  begin
    perform public.transition_order(v_order, 'delivered');
    raise exception 'an illegal order transition was permitted';
  exception
    when check_violation then null;  -- expected
  end;

  -- The legal path works and is audited.
  perform public.transition_order(v_order, 'confirmed', null, 'seller_confirmed');
  assert (select status from public.orders where id = v_order) = 'confirmed',
    'the legal transition did not apply';
  assert (select confirmed_at is not null from public.orders where id = v_order),
    'confirmed_at was not stamped by the transition function';
  assert (select count(*) from public.order_events
           where order_id = v_order and type = 'seller_confirmed') = 1,
    'the transition did not write an audit row';

  -- Repeating a transition is a no-op that still records the attempt, because
  -- cron delivery is at-least-once. [D-20]
  perform public.transition_order(v_order, 'confirmed', null, 'seller_confirmed');
  assert (select count(*) from public.order_events where order_id = v_order) = 2,
    'the idempotent re-run did not record a noop event';
  assert (select status from public.orders where id = v_order) = 'confirmed',
    'the idempotent re-run changed the status';
end $$;
rollback;

\echo ''
\echo 'RLS and invariant assertions: all passed.'
