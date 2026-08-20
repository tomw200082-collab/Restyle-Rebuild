-- 0001 — extensions, shared helpers, enums.
-- Everything later depends on this file.

create extension if not exists "pgcrypto";

-- Shared updated_at trigger. Attached to every mutable table so that admin SQL
-- and cron jobs cannot skip it the way application-set timestamps can. [D-23]
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Enums. Status vocabularies are closed sets enforced by the type system;
-- the legacy app's status column accepted anything and its live data contained
-- four values its own schema never declared. [LI 8.1]
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.listing_status as enum (
    'draft', 'pending_review', 'active', 'reserved', 'sold',
    'rejected', 'expired', 'removed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.listing_condition as enum ('like_new', 'excellent', 'good', 'fair');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum (
    'pending_seller_confirmation', 'confirmed', 'delivery_scheduled',
    'picked_up', 'delivered', 'completed', 'cancelled', 'disputed', 'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.offer_status as enum (
    'pending', 'accepted', 'declined', 'countered', 'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.delivery_shift as enum ('morning', 'afternoon', 'evening');
exception when duplicate_object then null; end $$;
