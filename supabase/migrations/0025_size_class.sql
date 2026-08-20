-- 0025 — size class, and the bulky-item surcharge it prices.
--
-- Zone fees are flat — ₪149 / ₪199 / ₪249 — and the legacy catalogue was about
-- 60% tier-4 items: sofas and wardrobes needing two people and a full van. The
-- flat fee therefore sits below cost on exactly the items the platform sells
-- most of. [FINAL_REPORT §5]
--
-- The fix prices *size*, not distance. Zone base prices do not move: ₪149 is a
-- published headline and the promise that gets people to try the service. A
-- named surcharge on the items that genuinely cost more to move is legible at
-- checkout in a way a raised base price is not.
--
-- The classifier lives here rather than in TypeScript because three consumers
-- need it and they must not disagree: the fee engine (money), the KPI views
-- (delivery margin by size class), and the admin review queue (so a crew-sized
-- item is flagged before it is approved). One implementation, in the place that
-- can enforce it. Dimensions are already required on every listing — `width_cm`,
-- `depth_cm` and `height_cm` are all `not null` — so no new input is asked of
-- sellers. [D-72]

do $$ begin
  create type public.listing_size_class as enum ('standard', 'bulky');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- The classifier.
--
-- Two independent triggers, because the cost is two different things. Volume is
-- van space. Longest edge is whether two people are needed to get it round a
-- stairwell — a bookcase is 0.48 m³ and still a two-person carry at 200 cm.
--
-- Per-category thresholds exist for one honest reason: the generic rule
-- misclassifies light-but-large items. A floor lamp is 180 cm and one person
-- carries it; a rolled rug is 250 cm and weighs nothing. Those two categories
-- get a raised edge threshold. Everything else uses the default, and the
-- function says so rather than enumerating twelve identical rows.
-- ---------------------------------------------------------------------------
create or replace function public.classify_size(
  p_width_cm      int,
  p_depth_cm      int,
  p_height_cm     int,
  p_category_slug text
) returns public.listing_size_class
language sql immutable parallel safe as $$
  with thresholds as (
    select
      case p_category_slug
        -- Tall and light: carried by one person, whatever the tape says.
        when 'lighting' then 250
        when 'rugs'     then 300
        else 180
      end as max_edge_cm,
      case p_category_slug
        when 'rugs' then 1.2
        else 0.8
      end as max_volume_m3
  )
  select case
    when p_width_cm is null or p_depth_cm is null or p_height_cm is null
      then 'standard'::public.listing_size_class
    when (p_width_cm::numeric * p_depth_cm * p_height_cm) / 1000000.0
           >= (select max_volume_m3 from thresholds)
      then 'bulky'::public.listing_size_class
    when greatest(p_width_cm, p_depth_cm, p_height_cm)
           >= (select max_edge_cm from thresholds)
      then 'bulky'::public.listing_size_class
    else 'standard'::public.listing_size_class
  end
$$;

comment on function public.classify_size(int, int, int, text) is
  'Size class from dimensions. Bulky when volume >= 0.8 m3 (1.2 for rugs) or the '
  'longest edge >= 180 cm (250 for lighting, 300 for rugs). Immutable so a '
  'trigger, a view and a check can all call it and agree. [D-72]';

-- A definer function published in `public` is an anonymous RPC endpoint until
-- EXECUTE is taken away — Postgres grants it to PUBLIC by default and Supabase
-- exposes everything in `public` at /rest/v1/rpc/*. This one is a pure
-- function with no side effects and no privileges, so it is safe to expose;
-- said explicitly so the next reader does not have to work it out. [D-44]
grant execute on function public.classify_size(int, int, int, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The column.
--
-- Not a generated column: the classifier needs the category's *slug*, which
-- lives in another table, and a generated expression may not reference one. A
-- trigger can join, so the value is maintained on write and is correct even for
-- a row edited directly in SQL — which is how the reference data got edited
-- once already. [D-57]
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists size_class public.listing_size_class not null default 'standard';

create or replace function public.listings_set_size_class()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_slug text;
begin
  select c.slug into v_slug from public.categories c where c.id = new.category_id;
  new.size_class := public.classify_size(new.width_cm, new.depth_cm, new.height_cm, v_slug);
  return new;
end $$;

revoke all on function public.listings_set_size_class() from public, anon, authenticated;

drop trigger if exists listings_size_class on public.listings;
create trigger listings_size_class
  before insert or update of width_cm, depth_cm, height_cm, category_id
  on public.listings
  for each row execute function public.listings_set_size_class();

-- Backfill. Idempotent: re-running recomputes the same value.
update public.listings l
   set size_class = public.classify_size(l.width_cm, l.depth_cm, l.height_cm, c.slug)
  from public.categories c
 where c.id = l.category_id
   and l.size_class is distinct from public.classify_size(l.width_cm, l.depth_cm, l.height_cm, c.slug);

-- Delivery margin by size class is the KPI this whole migration exists to make
-- measurable, and it filters on this column.
create index if not exists listings_size_class_idx
  on public.listings (size_class, status);

-- ---------------------------------------------------------------------------
-- The column grant.
--
-- 0016 revoked the table-level SELECT on `listings` and re-granted column by
-- column, precisely so that a column added later is *not* granted and fails
-- closed. That is working as designed — and it means a new public column has to
-- be granted deliberately. `size_class` is public: the buyer sees the surcharge
-- it produces at checkout, so hiding the reason would be worse than useless.
-- `pickup_street` remains ungranted. [D-45]
-- ---------------------------------------------------------------------------
grant select (size_class) on public.listings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The fee.
-- ---------------------------------------------------------------------------
insert into public.site_config (key, value, description) values
  ('bulky_surcharge_agorot', '8000'::jsonb,
   'Charged once when the item is size_class = bulky and the platform delivers. '
   'Zone base prices are unchanged: ₪149 stays the headline. [D-72]')
on conflict (key) do nothing;
