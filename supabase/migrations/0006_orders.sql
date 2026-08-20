-- 0006 — orders, the append-only audit, and the order state machine.
-- This is the file that guards money.

create table if not exists public.orders (
  id                      uuid primary key default gen_random_uuid(),
  listing_id              uuid not null references public.listings(id) on delete restrict,
  buyer_id                uuid not null references auth.users(id) on delete restrict,
  seller_id               uuid not null references auth.users(id) on delete restrict,
  offer_id                uuid references public.offers(id) on delete set null,

  status                  public.order_status not null default 'pending_seller_confirmation',

  -- Money. Every amount integer agorot; the two balance constraints below make
  -- an arithmetically impossible order unstorable. [D-01], [D-10]
  item_agorot             bigint not null check (item_agorot >= 0),
  delivery_agorot         bigint not null default 0 check (delivery_agorot >= 0),
  surcharges              jsonb  not null default '[]'::jsonb,
  surcharges_agorot       bigint not null default 0 check (surcharges_agorot >= 0),
  total_agorot            bigint not null check (total_agorot >= 0),
  commission_agorot       bigint not null check (commission_agorot >= 0),
  seller_payout_agorot    bigint not null check (seller_payout_agorot >= 0),
  cancellation_fee_agorot bigint not null default 0 check (cancellation_fee_agorot >= 0),
  refund_agorot           bigint not null default 0 check (refund_agorot >= 0),

  delivery_method         text not null check (delivery_method in ('platform', 'self_pickup')),
  dropoff_city            text,
  dropoff_street          text,
  dropoff_floor           int check (dropoff_floor between 0 and 99),
  dropoff_has_elevator    boolean,
  dropoff_notes           text,

  payment_provider        text not null default 'mock',
  payment_ref             text,

  cancellation_reason     text,
  protection_expires_at   timestamptz,

  confirmed_at            timestamptz,
  scheduled_at            timestamptz,
  picked_up_at            timestamptz,
  delivered_at            timestamptz,
  completed_at            timestamptz,
  cancelled_at            timestamptz,
  disputed_at             timestamptz,
  refunded_at             timestamptz,
  paid_at                 timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint order_parties_differ    check (buyer_id <> seller_id),
  constraint order_money_balances    check (commission_agorot + seller_payout_agorot = item_agorot),
  constraint order_total_balances    check (total_agorot = item_agorot + delivery_agorot + surcharges_agorot),
  -- A platform delivery without a destination is an order nobody can fulfil.
  constraint order_platform_needs_address
    check (delivery_method <> 'platform' or (dropoff_city is not null and dropoff_street is not null)),
  -- Self-pickup carries no delivery charges at all: no crew, no carrying, no
  -- disassembly performed by the platform. [D-08]
  constraint order_self_pickup_is_free
    check (delivery_method <> 'self_pickup' or (delivery_agorot = 0 and surcharges_agorot = 0))
);

create index if not exists orders_buyer_idx    on public.orders (buyer_id, created_at desc);
create index if not exists orders_seller_idx   on public.orders (seller_id, created_at desc);
create index if not exists orders_listing_idx  on public.orders (listing_id);
create index if not exists orders_status_idx   on public.orders (status, created_at desc);
-- Drives the seller-confirmation timeout sweep, the product's most important job. [D-43]
create index if not exists orders_pending_confirm_idx
  on public.orders (created_at) where status = 'pending_seller_confirmation';
create index if not exists orders_protection_idx
  on public.orders (protection_expires_at) where status = 'delivered';

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Backfill the listings FK now that orders exists. [D-41]
do $$ begin
  alter table public.listings
    add constraint listings_resale_source_fk
    foreign key (resale_source_order_id) references public.orders(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Append-only audit. Its only value is that it cannot be edited afterwards.
-- ---------------------------------------------------------------------------

create table if not exists public.order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete restrict,
  actor_id   uuid references auth.users(id) on delete set null,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

create or replace function public.order_events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'order_events is append-only' using errcode = 'check_violation';
end $$;

drop trigger if exists order_events_no_mutate on public.order_events;
create trigger order_events_no_mutate
  before update or delete on public.order_events
  for each row execute function public.order_events_immutable();

-- ---------------------------------------------------------------------------
-- Order state machine
-- ---------------------------------------------------------------------------

create table if not exists public.order_status_transitions (
  from_status public.order_status not null,
  to_status   public.order_status not null,
  primary key (from_status, to_status)
);

insert into public.order_status_transitions (from_status, to_status) values
  ('pending_seller_confirmation', 'confirmed'),
  ('pending_seller_confirmation', 'cancelled'),   -- 48h timeout, or buyer cancels
  ('confirmed',                   'delivery_scheduled'),
  ('confirmed',                   'cancelled'),
  ('delivery_scheduled',          'picked_up'),
  ('delivery_scheduled',          'cancelled'),   -- inspection mismatch [D-12]
  ('picked_up',                   'delivered'),
  ('picked_up',                   'cancelled'),   -- inspection mismatch [D-12]
  ('delivered',                   'completed'),
  ('delivered',                   'disputed'),    -- only inside the window [D-13]
  ('disputed',                    'completed'),   -- dispute rejected
  ('disputed',                    'refunded'),
  ('cancelled',                   'refunded')
on conflict do nothing;

-- The single guarded path for every order status change. There is no other. [D-04]
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

-- Convenience for non-status audit entries (payment captured, refund issued,
-- inspection flagged). Money-affecting actions always write one. [D-05]
create or replace function public.record_order_event(
  p_order_id uuid,
  p_actor    uuid,
  p_type     text,
  p_payload  jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.order_events (order_id, actor_id, type, payload)
  values (p_order_id, p_actor, p_type, p_payload);
$$;

create or replace function public.owns_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders
     where id = p_order_id and (buyer_id = auth.uid() or seller_id = auth.uid())
  )
$$;
