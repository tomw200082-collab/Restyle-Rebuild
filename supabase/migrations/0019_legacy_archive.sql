-- 0019 — archive tables for the legacy import.
--
-- Historical users and orders are recorded rather than replayed. Legacy orders
-- lived in a state machine that no longer exists (72% of them died in
-- `awaiting_seller_response`), so injecting them into `orders` would fill the
-- operational queues with rows nobody can act on. Keeping them here preserves
-- the audit trail and gives the redirect map something to point at. [D-42]

create table if not exists public.legacy_users (
  legacy_id   text primary key,
  email       text not null,
  full_name   text,
  phone       text,
  city        text,
  raw         jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists legacy_users_email_idx on public.legacy_users (lower(email));

create table if not exists public.legacy_orders (
  legacy_id      text primary key,
  legacy_status  text,
  buyer_email    text,
  seller_email   text,
  item_legacy_id text,
  total_agorot   bigint,
  created_at     timestamptz,
  raw            jsonb not null,
  imported_at    timestamptz not null default now()
);

create index if not exists legacy_orders_buyer_idx on public.legacy_orders (lower(buyer_email));

-- These hold real names, addresses and phone numbers of people who used the
-- pilot. Nothing but the service role may read them; there is no product
-- surface that shows a legacy record to a visitor.
--
-- RLS enabled with **zero policies** is the point, not an oversight: it denies
-- everything to anon and authenticated, which is exactly the intended posture,
-- and the grants are revoked besides. Supabase's advisor reports this as an
-- INFO notice because it is usually a mistake. Here it is the design — do not
-- "fix" it by adding a policy.
alter table public.legacy_users  enable row level security;
alter table public.legacy_orders enable row level security;

revoke all on public.legacy_users  from anon, authenticated;
revoke all on public.legacy_orders from anon, authenticated;

grant all on public.legacy_users  to service_role;
grant all on public.legacy_orders to service_role;
