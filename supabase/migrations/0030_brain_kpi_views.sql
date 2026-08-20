-- 0030 — the KPI views the production brain reads.
--
-- 0009 already holds four views behind the admin dashboard. These are different
-- in a way worth stating: those answer "what is the state right now" for a
-- person looking at a screen, and these answer "what happened yesterday, and is
-- it moving" for a brief generated at 06:30 by something with no screen.
--
-- Every one is `security_invoker`, so a non-admin querying one sees nothing
-- rather than everything — the view inherits the caller's RLS instead of the
-- definer's. That is the same choice 0009 made and for the same reason.
--
-- **These are the sanctioned definitions.** A metric recomputed inline by a
-- script will disagree with the dashboard within a month, and then nobody knows
-- which number is real. `ops-analyst` is told to use them; `brain/` reads them
-- and nothing else. [D-77]

-- ---------------------------------------------------------------------------
-- Daily money. One row per day, so a brief can say "yesterday" and a weekly
-- report can say "the last seven days" from the same view.
-- ---------------------------------------------------------------------------
create or replace view public.brain_daily_money
with (security_invoker = true) as
select
  date_trunc('day', o.created_at)::date                                    as day,
  count(*)                                                                 as orders_created,
  count(*) filter (where o.status = 'completed')                           as orders_completed,
  count(*) filter (where o.status = 'cancelled')                           as orders_cancelled,
  coalesce(sum(o.item_agorot)        filter (where o.status = 'completed'), 0) as gmv_agorot,
  coalesce(sum(o.commission_agorot)  filter (where o.status = 'completed'), 0) as take_agorot,
  coalesce(sum(o.delivery_agorot + o.surcharges_agorot)
             filter (where o.status = 'completed'), 0)                     as delivery_revenue_agorot,
  coalesce(sum(o.refund_agorot), 0)                                        as refunded_agorot
from public.orders o
group by 1;

comment on view public.brain_daily_money is
  'GMV, take and delivery revenue by day. Agorot — divide by 100 for display only. [D-77]';

-- ---------------------------------------------------------------------------
-- Sell-through and time-to-sale.
--
-- Median, not mean: one item that sat for six months would drag a mean far
-- enough to make it useless, and the number a seller cares about is "how long
-- does this usually take".
-- ---------------------------------------------------------------------------
create or replace view public.brain_sell_through
with (security_invoker = true) as
select
  count(*) filter (where l.status = 'active')                              as active_listings,
  count(*) filter (where l.status = 'sold')                                as sold_listings,
  count(*) filter (where l.status = 'pending_review')                      as awaiting_review,
  count(*) filter (where l.status = 'paused')                              as paused_listings,
  count(*) filter (where l.status = 'expired')                             as expired_listings,
  round(
    100.0 * count(*) filter (where l.status = 'sold')
    / nullif(count(*) filter (where l.status in ('active', 'sold', 'expired')), 0), 1
  )                                                                        as sell_through_pct,
  round(
    (percentile_cont(0.5) within group (
      order by extract(epoch from (o.created_at - l.published_at)) / 86400.0
    ) filter (where l.status = 'sold' and l.published_at is not null))::numeric, 1
  )                                                                        as median_days_to_sale
from public.listings l
left join public.orders o
  on o.listing_id = l.id and o.status in ('completed', 'delivered');

-- ---------------------------------------------------------------------------
-- Review-queue latency. Every listing is human-approved, so the queue is the
-- growth ceiling: a listing waiting for review is inventory that cannot sell.
-- ---------------------------------------------------------------------------
create or replace view public.brain_review_queue
with (security_invoker = true) as
select
  count(*)                                                                 as waiting,
  round(
    (extract(epoch from (now() - min(l.created_at))) / 3600.0)::numeric, 1
  )                                                                        as oldest_hours,
  round(
    (avg(extract(epoch from (now() - l.created_at)) / 3600.0))::numeric, 1
  )                                                                        as avg_wait_hours
from public.listings l
where l.status = 'pending_review';

-- ---------------------------------------------------------------------------
-- Offers. Tells you whether `offer_min_pct = 60` is set right before anyone
-- argues about it.
-- ---------------------------------------------------------------------------
create or replace view public.brain_offers
with (security_invoker = true) as
select
  count(*)                                                                 as total_offers,
  count(*) filter (where f.status = 'accepted')                            as accepted,
  count(*) filter (where f.status = 'declined')                            as declined,
  count(*) filter (where f.status = 'expired')                             as expired,
  count(*) filter (where f.status = 'pending')                             as pending,
  round(100.0 * count(*) filter (where f.status = 'accepted')
        / nullif(count(*) filter (where f.status <> 'pending'), 0), 1)     as acceptance_pct,
  round(avg(100.0 * f.amount_agorot / nullif(l.price_agorot, 0))::numeric, 1)
                                                                           as avg_offer_pct_of_ask
from public.offers f
join public.listings l on l.id = f.listing_id;

-- ---------------------------------------------------------------------------
-- Delivery lead time and margin by size class.
--
-- The size-class split is the whole reason `classify_size` exists: the bulky
-- surcharge is a guess until this view says whether it closed the gap. [D-72]
-- ---------------------------------------------------------------------------
create or replace view public.brain_delivery
with (security_invoker = true) as
select
  l.size_class,
  coalesce(dz.zone, 'unknown')                                             as zone,
  count(*)                                                                 as deliveries,
  round(
    -- Lead time is confirmation → the crew's dropoff date. `dropoff_date` is a
    -- date and `confirmed_at` is a timestamptz, so the subtraction is done in
    -- days directly rather than through epoch seconds.
    (avg(d.dropoff_date - o.confirmed_at::date)
     filter (where d.dropoff_date is not null and o.confirmed_at is not null))::numeric, 1
  )                                                                        as avg_lead_days,
  coalesce(sum(o.delivery_agorot + o.surcharges_agorot), 0)                as charged_agorot,
  coalesce(sum(d.actual_cost_agorot), 0)                                   as actual_cost_agorot,
  coalesce(sum(o.delivery_agorot + o.surcharges_agorot), 0)
    - coalesce(sum(d.actual_cost_agorot), 0)                               as margin_agorot
from public.orders o
join public.listings l        on l.id = o.listing_id
left join public.deliveries d  on d.order_id = o.id
left join public.delivery_zones dz on dz.city = o.dropoff_city
where o.delivery_method = 'platform'
group by 1, 2;

-- ---------------------------------------------------------------------------
-- Liquidity by category: where supply and demand disagree.
--
-- A category with many active listings and no sales is dead inventory taking up
-- catalogue space; one with a high sell-through and few listings is demand the
-- platform is failing to supply. Both are actions, and they are opposite ones.
-- ---------------------------------------------------------------------------
create or replace view public.brain_category_liquidity
with (security_invoker = true) as
select
  c.slug,
  c.name_he                                                                as category,
  count(*) filter (where l.status = 'active')                              as active_listings,
  count(*) filter (where l.status = 'sold')                                as sold_listings,
  count(*) filter (where l.size_class = 'bulky' and l.status = 'active')   as active_bulky,
  round(
    100.0 * count(*) filter (where l.status = 'sold')
    / nullif(count(*) filter (where l.status in ('active', 'sold', 'expired')), 0), 1
  )                                                                        as sell_through_pct,
  round(avg(l.price_agorot) filter (where l.status = 'active')::numeric, 0) as avg_active_price_agorot
from public.categories c
left join public.listings l on l.category_id = c.id
group by c.slug, c.name_he;

-- ---------------------------------------------------------------------------
-- Seller responsiveness — the metric that killed the pilot.
--
-- 72% of legacy orders died waiting for a seller to confirm, so this is the
-- first line of the morning brief and not a footnote. [D-43], [D-74]
-- ---------------------------------------------------------------------------
create or replace view public.brain_seller_response
with (security_invoker = true) as
select
  count(*)                                                                 as requests,
  count(*) filter (where o.confirmed_at is not null)                       as confirmed,
  count(*) filter (where o.status = 'cancelled' and o.confirmed_at is null) as timed_out,
  count(*) filter (where o.status = 'pending_seller_confirmation')         as awaiting_now,
  round(100.0 * count(*) filter (where o.confirmed_at is not null)
        / nullif(count(*), 0), 1)                                          as confirm_rate_pct,
  round((avg(extract(epoch from (o.confirmed_at - o.created_at)) / 3600.0)
         filter (where o.confirmed_at is not null))::numeric, 1)           as avg_hours_to_confirm,
  (select count(*) from public.profiles p where p.listings_paused_at is not null)
                                                                           as sellers_paused
from public.orders o;

-- ---------------------------------------------------------------------------
-- Anomalies: orders sitting in a non-terminal state longer than their window
-- allows.
--
-- A row here is never a business problem — it is a cron job that did not run,
-- or a kill switch somebody left on. It belongs in the brief because those are
-- silent, and silence is this project's most expensive failure mode.
-- ---------------------------------------------------------------------------
create or replace view public.brain_stuck_orders
with (security_invoker = true) as
with windows as (
  select
    coalesce((select (value #>> '{}')::int from public.site_config
               where key = 'seller_confirm_hours'), 48)                    as confirm_hours,
    coalesce((select (value #>> '{}')::int from public.site_config
               where key = 'protection_hours'), 48)                        as protection_hours
)
select
  o.id,
  o.status,
  o.created_at,
  round((extract(epoch from (now() - o.created_at)) / 3600.0)::numeric, 1) as age_hours,
  case o.status
    when 'pending_seller_confirmation' then 'past the seller confirmation window'
    when 'delivered'                   then 'past the buyer protection window'
    else 'in a non-terminal state for an unusually long time'
  end                                                                      as why
from public.orders o, windows w
where (o.status = 'pending_seller_confirmation'
        and o.created_at < now() - make_interval(hours => w.confirm_hours))
   or (o.status = 'delivered'
        and o.delivered_at < now() - make_interval(hours => w.protection_hours))
   or (o.status in ('confirmed', 'delivery_scheduled', 'picked_up')
        and o.created_at < now() - interval '14 days');

comment on view public.brain_stuck_orders is
  'Orders past their own window. A row here means a job did not run, not that a '
  'customer did something unusual. [D-77]';

-- Stated, not inherited — the same reasoning as 0026. A view created under a
-- role whose default privileges do not cover the API roles is a view nothing
-- can read, and the failure would be a brief full of zeroes rather than an
-- error. [D-73]
grant select on public.brain_daily_money, public.brain_sell_through,
  public.brain_review_queue, public.brain_offers, public.brain_delivery,
  public.brain_category_liquidity, public.brain_seller_response,
  public.brain_stuck_orders
  to anon, authenticated, service_role;
