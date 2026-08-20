-- 0008 — favourites, saved searches, outbound notifications, legacy redirects.

create table if not exists public.favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index if not exists favorites_listing_idx on public.favorites (listing_id);

-- Demand capture for buyers who find nothing today. The WhatsApp channel is
-- explicitly out of scope; it arrives later through outbound_events. [MP 10]
create table if not exists public.saved_searches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text,
  query       jsonb not null,
  channel     text not null default 'email' check (channel in ('email')),
  active      boolean not null default true,
  last_run_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists saved_searches_active_idx on public.saved_searches (active, last_run_at);

drop trigger if exists saved_searches_touch on public.saved_searches;
create trigger saved_searches_touch before update on public.saved_searches
  for each row execute function public.touch_updated_at();

-- Every outbound notification, whatever the channel. Replaces the legacy app's
-- three overlapping log tables (EmailEvent / NotificationLog / AuditLog) and is
-- the documented integration point for a future WhatsApp channel. [LI 8.5]
create table if not exists public.outbound_events (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,
  channel         text not null default 'email' check (channel in ('email', 'whatsapp', 'sms')),
  recipient       text not null,
  recipient_role  text check (recipient_role in ('buyer', 'seller', 'admin')),
  subject         text,
  payload         jsonb not null default '{}'::jsonb,
  -- Idempotency key: makes a retried send a no-op rather than a duplicate email.
  idempotency_key text unique,
  status          text not null default 'queued'
                    check (status in ('queued', 'sent', 'failed', 'skipped')),
  error           text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists outbound_events_status_idx on public.outbound_events (status, created_at);

-- Legacy ids are 24-char hex (Mongo ObjectId shape), not uuids. [D-42], [LI 6]
create table if not exists public.legacy_redirects (
  legacy_id   text primary key,
  legacy_path text,
  new_path    text not null,
  created_at  timestamptz not null default now()
);
