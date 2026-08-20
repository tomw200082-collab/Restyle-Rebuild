-- 0005 — offers. The negotiation mechanic the legacy app deliberately lacked
-- ("zero negotiation", [LI 0]) and which Israeli second-hand buyers expect. [D-15]

create table if not exists public.offers (
  id                    uuid primary key default gen_random_uuid(),
  listing_id            uuid not null references public.listings(id) on delete cascade,
  buyer_id              uuid not null references auth.users(id) on delete cascade,
  amount_agorot         bigint not null check (amount_agorot >= 5000),
  status                public.offer_status not null default 'pending',
  counter_amount_agorot bigint check (counter_amount_agorot >= 5000),
  expires_at            timestamptz not null,
  -- 24h exclusive checkout window opened by acceptance. The listing stays
  -- purchasable at full price by others until capture. [D-15]
  checkout_expires_at   timestamptz,
  responded_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint offer_counter_present
    check (status <> 'countered' or counter_amount_agorot is not null),
  constraint offer_checkout_window
    check (status <> 'accepted' or checkout_expires_at is not null)
);

create index if not exists offers_listing_idx on public.offers (listing_id, status);
create index if not exists offers_buyer_idx   on public.offers (buyer_id, status);
create index if not exists offers_expiry_idx  on public.offers (expires_at) where status in ('pending', 'countered');

-- One live offer per buyer per listing. Without this, a buyer can spam a
-- seller with offers and the seller's queue becomes unusable.
create unique index if not exists offers_one_live_per_buyer
  on public.offers (listing_id, buyer_id)
  where status in ('pending', 'countered', 'accepted');

drop trigger if exists offers_touch on public.offers;
create trigger offers_touch before update on public.offers
  for each row execute function public.touch_updated_at();
