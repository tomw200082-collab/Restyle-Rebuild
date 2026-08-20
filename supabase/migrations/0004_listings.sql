-- 0004 — listings, photos, and the listing state machine.

create table if not exists public.listings (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  seller_id              uuid not null references auth.users(id) on delete restrict,

  title                  text not null check (char_length(btrim(title)) between 3 and 120),
  description            text not null default '',
  category_id            uuid not null references public.categories(id) on delete restrict,
  brand_id               uuid references public.brands(id) on delete set null,
  brand_free_text        text,
  condition              public.listing_condition not null,

  width_cm               int not null check (width_cm  between 1 and 1000),
  depth_cm               int not null check (depth_cm  between 1 and 1000),
  height_cm              int not null check (height_cm between 1 and 1000),

  -- Money is integer agorot, always. [D-01]
  original_price_agorot  bigint check (original_price_agorot >= 0),
  price_agorot           bigint not null check (price_agorot >= 5000),

  -- Zero-commission resale, honoured by the fee engine. Backs the published
  -- "free resale within 7 days" promise. [D-41], [LI 7.6]
  commission_pct_override numeric(5,2) check (commission_pct_override between 0 and 100),
  resale_source_order_id uuid,

  status                 public.listing_status not null default 'draft',
  rejection_reason       text,

  -- Address split: city is public, street is not. A public projection that
  -- forgets to exclude the street cannot leak it, because the street is not in
  -- the public projection at all. [D-06]
  pickup_city            text not null,
  pickup_street          text,
  pickup_floor           int not null default 0 check (pickup_floor between 0 and 99),
  pickup_has_elevator    boolean not null default false,
  needs_disassembly      boolean not null default false,
  allow_self_pickup      boolean not null default true,

  notes                  text,
  view_count             int not null default 0,
  published_at           timestamptz,
  expires_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- A rejection without a reason is a support ticket. 49 rejection emails were
  -- sent by the legacy app, so this is a well-travelled path. [LI 2]
  constraint listing_rejection_has_reason
    check (status <> 'rejected' or (rejection_reason is not null and btrim(rejection_reason) <> ''))
);

create index if not exists listings_status_idx        on public.listings (status);
create index if not exists listings_active_idx        on public.listings (published_at desc) where status = 'active';
create index if not exists listings_category_idx      on public.listings (category_id, status);
create index if not exists listings_brand_idx         on public.listings (brand_id, status);
create index if not exists listings_city_idx          on public.listings (pickup_city, status);
create index if not exists listings_seller_idx        on public.listings (seller_id, status);
create index if not exists listings_price_idx         on public.listings (price_agorot) where status = 'active';
create index if not exists listings_expiry_idx        on public.listings (expires_at) where status = 'active';

drop trigger if exists listings_touch on public.listings;
create trigger listings_touch before update on public.listings
  for each row execute function public.touch_updated_at();

create table if not exists public.listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  storage_path text not null,
  sort         int not null default 0,
  alt_text     text,
  width        int,
  height       int,
  created_at   timestamptz not null default now()
);
create index if not exists listing_photos_listing_idx on public.listing_photos (listing_id, sort);

-- ---------------------------------------------------------------------------
-- Listing state machine. Legal transitions are data, not branches. [D-04]
-- ---------------------------------------------------------------------------

create table if not exists public.listing_status_transitions (
  from_status public.listing_status not null,
  to_status   public.listing_status not null,
  primary key (from_status, to_status)
);

insert into public.listing_status_transitions (from_status, to_status) values
  ('draft',          'pending_review'),
  ('draft',          'removed'),
  ('pending_review', 'active'),
  ('pending_review', 'rejected'),
  ('pending_review', 'removed'),
  ('rejected',       'pending_review'),   -- re-submit after fixing [LI 6]
  ('rejected',       'removed'),
  ('active',         'reserved'),
  ('active',         'expired'),
  ('active',         'removed'),
  ('reserved',       'sold'),
  ('reserved',       'active'),           -- order cancelled
  ('expired',        'active'),           -- one-click renew
  ('expired',        'removed'),
  ('sold',           'removed')
on conflict do nothing;

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
