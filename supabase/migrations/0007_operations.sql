-- 0007 — deliveries, payouts, disputes: the operational tables behind the
-- admin cockpit.

-- Shifts rather than arbitrary time ranges, with the legacy calendar rules
-- (no Saturdays, Friday mornings only). Reusing proven scheduling constraints
-- beats re-deriving them. [D-32], [LI 3]
create table if not exists public.deliveries (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null unique references public.orders(id) on delete cascade,

  -- 2–3 windows the seller proposes; admin picks one. [D-14]
  proposed_windows   jsonb not null default '[]'::jsonb,

  pickup_date        date,
  pickup_shift       public.delivery_shift,
  dropoff_date       date,
  dropoff_shift      public.delivery_shift,

  crew_name          text,
  crew_phone         text,

  status             text not null default 'unscheduled'
                       check (status in ('unscheduled', 'scheduled', 'picked_up', 'delivered', 'failed')),
  inspection_ok      boolean,
  inspection_note    text,
  admin_notes        text,

  -- Captured so realised delivery revenue can be compared against real crew
  -- cost. The v2 flat zone fees may sit below cost on tier-4 items. [D-37]
  actual_cost_agorot bigint check (actual_cost_agorot >= 0),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint delivery_scheduled_has_windows
    check (status = 'unscheduled'
           or (pickup_date is not null and pickup_shift is not null
               and dropoff_date is not null and dropoff_shift is not null)),
  -- Pickup cannot follow dropoff. Cheap constraint, catches a real data-entry slip.
  constraint delivery_order_of_events
    check (pickup_date is null or dropoff_date is null or pickup_date <= dropoff_date)
);
create index if not exists deliveries_pickup_idx  on public.deliveries (pickup_date, pickup_shift);
create index if not exists deliveries_dropoff_idx on public.deliveries (dropoff_date, dropoff_shift);
create index if not exists deliveries_status_idx  on public.deliveries (status);

drop trigger if exists deliveries_touch on public.deliveries;
create trigger deliveries_touch before update on public.deliveries
  for each row execute function public.touch_updated_at();

-- Sellers are paid after delivery. Without a ledger, "did we pay this seller"
-- is unanswerable — the legacy app had no payout table at all. [D-16]
create table if not exists public.payouts (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references public.orders(id) on delete restrict,
  seller_id     uuid not null references auth.users(id) on delete restrict,
  amount_agorot bigint not null check (amount_agorot >= 0),
  status        text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at       timestamptz,
  method_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint payout_paid_has_date check (status <> 'paid' or paid_at is not null)
);
create index if not exists payouts_seller_idx on public.payouts (seller_id, status);
create index if not exists payouts_status_idx on public.payouts (status, created_at);

drop trigger if exists payouts_touch on public.payouts;
create trigger payouts_touch before update on public.payouts
  for each row execute function public.touch_updated_at();

create table if not exists public.disputes (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete restrict,
  opened_by       uuid not null references auth.users(id) on delete restrict,
  reason          text not null
                    check (reason in ('not_as_described', 'damaged', 'wrong_item', 'missing_parts')),
  description     text not null check (char_length(btrim(description)) >= 10),
  photo_paths     text[] not null default '{}',
  status          text not null default 'open'
                    check (status in ('open', 'resolved_refund', 'resolved_partial', 'rejected')),
  resolution_note text,
  refund_agorot   bigint not null default 0 check (refund_agorot >= 0),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint dispute_resolution_recorded
    check (status = 'open' or (resolved_at is not null and resolution_note is not null)),
  constraint dispute_partial_has_amount
    check (status <> 'resolved_partial' or refund_agorot > 0)
);
create index if not exists disputes_order_idx  on public.disputes (order_id);
create index if not exists disputes_status_idx on public.disputes (status, created_at);
-- One open dispute per order; a second is a comment on the first.
create unique index if not exists disputes_one_open_per_order
  on public.disputes (order_id) where status = 'open';

drop trigger if exists disputes_touch on public.disputes;
create trigger disputes_touch before update on public.disputes
  for each row execute function public.touch_updated_at();
