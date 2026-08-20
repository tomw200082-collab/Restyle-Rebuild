-- 0028 — pausing a seller who keeps not answering.
--
-- 72% of legacy orders died waiting for a seller to confirm. v2 already does
-- everything the software can do about a *single* order: a 24h reminder, a 48h
-- window, one authenticated tap to confirm, and an auto-cancel with a full
-- refund when it expires. [D-43]
--
-- What none of that addresses is the seller who is simply gone. Their listings
-- stay in the catalogue, keep attracting buyers, and keep converting into
-- orders that will expire in 48 hours — so every additional buyer gets the
-- worst experience the platform can produce, and the platform pays for the
-- refund each time. The listing is the thing still making promises, so the
-- listing is what stops.
--
-- After two consecutive expired confirmations the seller's other active
-- listings are paused. Not deleted, not rejected: paused, reversible in one
-- click by an admin, and reversible by the seller answering. [D-74]

insert into public.listing_status_transitions (from_status, to_status) values
  ('active', 'paused'),   -- the seller stopped answering
  ('paused', 'active'),   -- an admin unpaused, or the seller came back
  ('paused', 'expired'),  -- the TTL ran out while paused
  ('paused', 'removed')   -- the seller gave up
on conflict do nothing;

-- Deliberately absent: `paused -> reserved` and `paused -> sold`. A paused
-- listing cannot be bought, and that is the entire mechanism. It is enforced
-- here rather than in a check at checkout, so there is no path that forgets.

-- ---------------------------------------------------------------------------
-- The counter.
--
-- Consecutive, not cumulative. A seller who missed one confirmation a year ago
-- and has answered every one since is not a problem, and treating them like one
-- is how a safety mechanism becomes a reason to stop selling here. Reset on
-- every successful confirmation.
--
-- On `profiles`, which is publicly readable by row. That is a deliberate
-- acceptance rather than an oversight: the number is a count of missed
-- confirmations on a marketplace whose whole proposition is that the seller
-- will turn up, and no public projection in the application selects it.
-- Hiding it properly would need the column-privilege treatment `listings` gets,
-- and that machinery exists for a home address. [D-45]
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists expired_confirmations int not null default 0
    check (expired_confirmations >= 0);

alter table public.profiles
  add column if not exists listings_paused_at timestamptz;

comment on column public.profiles.expired_confirmations is
  'Consecutive expired seller confirmations. Reset to 0 on any confirmation. '
  'At seller_pause_after_expired, the seller''s active listings pause. [D-74]';

-- ---------------------------------------------------------------------------
-- The operations.
--
-- In SQL rather than in the job, for the reason every state change in this
-- schema is: one caller cannot forget the audit row, and the pause and the
-- events land in one transaction. The cron job and the admin console call the
-- same two functions, so an admin unpause and a seller-triggered one cannot
-- diverge.
-- ---------------------------------------------------------------------------
create or replace function public.pause_seller_listings(
  p_seller_id uuid,
  p_reason    text default 'seller_unresponsive'
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_listing record;
  v_count   int := 0;
begin
  for v_listing in
    select id from public.listings
     where seller_id = p_seller_id and status = 'active'
     for update
  loop
    perform public.transition_listing(v_listing.id, 'paused', null, p_reason);
    v_count := v_count + 1;
  end loop;

  update public.profiles
     set listings_paused_at = now()
   where id = p_seller_id;

  return v_count;
end $$;

create or replace function public.unpause_seller_listings(
  p_seller_id uuid,
  p_actor     uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_listing record;
  v_count   int := 0;
begin
  for v_listing in
    select id from public.listings
     where seller_id = p_seller_id and status = 'paused'
     for update
  loop
    perform public.transition_listing(v_listing.id, 'active', p_actor, 'admin_unpause');
    v_count := v_count + 1;
  end loop;

  -- Unpausing is the platform saying the seller is trusted again, so the
  -- counter goes with it. Leaving it at the threshold would re-pause them on
  -- the very next expiry, which is not what an admin pressing "unpause" means.
  update public.profiles
     set expired_confirmations = 0,
         listings_paused_at    = null
   where id = p_seller_id;

  return v_count;
end $$;

-- Both are SECURITY DEFINER and therefore anonymous RPC endpoints until EXECUTE
-- is taken away — Postgres grants it to PUBLIC by default and Supabase
-- publishes everything in `public` at /rest/v1/rpc/*. Pausing a competitor's
-- listings would be a fine denial-of-service if this were left open. [D-44]
revoke all on function public.pause_seller_listings(uuid, text) from public, anon, authenticated;
revoke all on function public.unpause_seller_listings(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pause_seller_listings(uuid, text) to service_role;
grant execute on function public.unpause_seller_listings(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- The threshold.
-- ---------------------------------------------------------------------------
insert into public.site_config (key, value, description) values
  ('seller_pause_after_expired', '2'::jsonb,
   'Consecutive expired seller confirmations before the seller''s other active '
   'listings are paused. 0 disables the automation entirely. [D-74]')
on conflict (key) do nothing;

create index if not exists listings_seller_paused_idx
  on public.listings (seller_id) where status = 'paused';
