-- 0003 — reference data: categories, brands, delivery zones, runtime config.
-- All four are admin-editable at runtime. The legacy app hardcoded fee values
-- across at least four files with mutually contradictory constants. [LI 8.14]

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name_he    text not null,
  parent_id  uuid references public.categories(id) on delete set null,
  sort       int not null default 0,
  intro_he   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists categories_parent_idx on public.categories (parent_id, sort);

create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Zone membership and price live together so a city can be re-zoned in one edit.
create table if not exists public.delivery_zones (
  city       text primary key,
  zone       text not null check (zone in ('A', 'B', 'C')),
  fee_agorot bigint not null check (fee_agorot >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();
drop trigger if exists brands_touch on public.brands;
create trigger brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();
drop trigger if exists delivery_zones_touch on public.delivery_zones;
create trigger delivery_zones_touch before update on public.delivery_zones
  for each row execute function public.touch_updated_at();
drop trigger if exists site_config_touch on public.site_config;
create trigger site_config_touch before update on public.site_config
  for each row execute function public.touch_updated_at();
