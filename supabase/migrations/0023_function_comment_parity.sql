-- 0023 — restore the inline commentary on three functions in the remote.
--
-- Pure documentation parity: no signature, no logic, no grant changes. Verified
-- by hashing each body with `--` comments stripped and whitespace collapsed —
-- all thirteen functions already hash identically across repo and remote, so
-- these three are the same programs and differ only in what they explain.
--
-- Why it is worth a migration rather than a shrug: `transition_order` is the
-- order state machine, and the comments that went missing are the ones stating
-- why the row lock exists, why a same-status transition is still audited, and
-- why every timestamp is written in one place. Someone reading `\sf
-- transition_order` on production was getting the code without any of that.
--
-- The comments were lost because these bodies were applied to the remote by
-- hand through the Supabase MCP during the build, retyped without them, while
-- the repo kept the annotated originals. See docs/RECONCILIATION.md.

create or replace function public.transition_listing(
  p_listing_id uuid,
  p_to         public.listing_status,
  p_actor      uuid default null,
  p_reason     text default null
) returns public.listings
language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings;
  v_from    public.listing_status;
  v_ttl_days int;
begin
  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'listing % not found', p_listing_id using errcode = 'no_data_found';
  end if;

  v_from := v_listing.status;

  -- Idempotent: re-running a transition that already landed is a no-op, not an
  -- error. Cron delivery is at-least-once. [D-20]
  if v_from = p_to then
    return v_listing;
  end if;

  if not exists (
    select 1 from public.listing_status_transitions
     where from_status = v_from and to_status = p_to
  ) then
    raise exception 'illegal listing transition: % -> %', v_from, p_to
      using errcode = 'check_violation';
  end if;

  select (value #>> '{}')::int into v_ttl_days
    from public.site_config where key = 'listing_ttl_days';
  v_ttl_days := coalesce(v_ttl_days, 90);

  update public.listings
     set status           = p_to,
         rejection_reason = case when p_to = 'rejected' then p_reason else rejection_reason end,
         published_at     = case when p_to = 'active' and published_at is null then now() else published_at end,
         expires_at       = case when p_to = 'active' then now() + make_interval(days => v_ttl_days) else expires_at end
   where id = p_listing_id
   returning * into v_listing;

  return v_listing;
end $$;

create or replace function public.transition_order(
  p_order_id   uuid,
  p_to         public.order_status,
  p_actor      uuid default null,
  p_event_type text default null,
  p_payload    jsonb default '{}'::jsonb
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_from  public.order_status;
  v_protection_hours int;
begin
  -- Row lock: two concurrent confirmations serialise instead of racing, so a
  -- double-clicked admin button cannot produce two transitions.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'no_data_found';
  end if;

  v_from := v_order.status;

  if v_from = p_to then
    -- Idempotent no-op, but still audited: a retried cron run must not refund
    -- twice, and must still leave a trace that it ran. [D-20]
    insert into public.order_events (order_id, actor_id, type, payload)
    values (p_order_id, p_actor, coalesce(p_event_type, 'noop'),
            p_payload || jsonb_build_object('from', v_from, 'to', p_to, 'noop', true));
    return v_order;
  end if;

  if not exists (
    select 1 from public.order_status_transitions
     where from_status = v_from and to_status = p_to
  ) then
    raise exception 'illegal order transition: % -> %', v_from, p_to
      using errcode = 'check_violation';
  end if;

  select (value #>> '{}')::int into v_protection_hours
    from public.site_config where key = 'protection_hours';
  v_protection_hours := coalesce(v_protection_hours, 48);

  -- Every per-transition timestamp is set here, in one place. Scattered
  -- `x_at = now()` assignments drift; this cannot.
  update public.orders
     set status       = p_to,
         confirmed_at = case when p_to = 'confirmed'          then now() else confirmed_at end,
         scheduled_at = case when p_to = 'delivery_scheduled' then now() else scheduled_at end,
         picked_up_at = case when p_to = 'picked_up'          then now() else picked_up_at end,
         delivered_at = case when p_to = 'delivered'          then now() else delivered_at end,
         completed_at = case when p_to = 'completed'          then now() else completed_at end,
         cancelled_at = case when p_to = 'cancelled'          then now() else cancelled_at end,
         disputed_at  = case when p_to = 'disputed'           then now() else disputed_at  end,
         refunded_at  = case when p_to = 'refunded'           then now() else refunded_at  end,
         protection_expires_at = case
           when p_to = 'delivered' then now() + make_interval(hours => v_protection_hours)
           else protection_expires_at end,
         cancellation_reason = case
           when p_to = 'cancelled' then coalesce(p_payload ->> 'reason', cancellation_reason)
           else cancellation_reason end
   where id = p_order_id
   returning * into v_order;

  -- Written in the same statement as the update: there is no code path that
  -- changes status without leaving a trace, because there is no other path.
  insert into public.order_events (order_id, actor_id, type, payload)
  values (p_order_id, p_actor, coalesce(p_event_type, 'status_change'),
          p_payload || jsonb_build_object('from', v_from, 'to', p_to));

  return v_order;
end $$;

create or replace function public.consume_rate_limit(
  p_bucket  text,
  p_subject text,
  p_limit   integer,
  p_window_seconds integer
) returns table (allowed boolean, remaining integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  -- Floor the clock to the window, so every request in the same window agrees
  -- on the key without any coordination.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, subject, window_start, count)
       values (p_bucket, p_subject, v_window_start, 1)
  on conflict (bucket, subject, window_start)
    do update set count = public.rate_limits.count + 1
    returning public.rate_limits.count into v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_window_start + make_interval(secs => p_window_seconds);
end $$;