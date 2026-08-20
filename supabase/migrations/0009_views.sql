-- 0009 — reporting views behind the admin KPI dashboard.
-- security_invoker means each view is evaluated under the caller's RLS, so a
-- non-admin querying one sees nothing rather than everything.

create or replace view public.kpi_overview
with (security_invoker = true) as
select
  count(*) filter (where o.status = 'completed')                                as completed_orders,
  coalesce(sum(o.item_agorot)       filter (where o.status = 'completed'), 0)   as gmv_agorot,
  coalesce(sum(o.commission_agorot) filter (where o.status = 'completed'), 0)   as take_agorot,
  coalesce(sum(o.delivery_agorot + o.surcharges_agorot)
             filter (where o.status = 'completed'), 0)                          as delivery_revenue_agorot,
  count(*) filter (where o.status not in ('cancelled', 'refunded'))             as live_orders,
  count(*) filter (where o.status = 'cancelled')                                as cancelled_orders
from public.orders o;

-- Seller confirmation is the metric that killed the pilot: 72% of legacy orders
-- died waiting for a seller to respond. It is a first-class KPI. [D-43], [LI 2]
create or replace view public.kpi_seller_response
with (security_invoker = true) as
select
  count(*)                                                                        as total_requests,
  count(*) filter (where o.confirmed_at is not null)                              as confirmed,
  count(*) filter (where o.status = 'cancelled' and o.confirmed_at is null)       as timed_out,
  round(
    100.0 * count(*) filter (where o.confirmed_at is not null)
    / nullif(count(*), 0), 1)                                                     as confirm_rate_pct,
  round(avg(extract(epoch from (o.confirmed_at - o.created_at)) / 3600.0)
        filter (where o.confirmed_at is not null)::numeric, 1)                    as avg_hours_to_confirm
from public.orders o;

-- Delivery revenue against volume, by zone and category. Makes the margin risk
-- from the flat zone pricing visible in week one rather than in an annual
-- reconciliation. [D-37]
create or replace view public.kpi_delivery_by_zone
with (security_invoker = true) as
select
  coalesce(dz.zone, 'unknown')                                as zone,
  c.name_he                                                    as category,
  count(*)                                                     as deliveries,
  coalesce(sum(o.delivery_agorot + o.surcharges_agorot), 0)    as charged_agorot,
  coalesce(sum(d.actual_cost_agorot), 0)                       as actual_cost_agorot,
  coalesce(sum(o.delivery_agorot + o.surcharges_agorot), 0)
    - coalesce(sum(d.actual_cost_agorot), 0)                   as margin_agorot
from public.orders o
join public.listings l       on l.id = o.listing_id
join public.categories c     on c.id = l.category_id
left join public.deliveries d on d.order_id = o.id
left join public.delivery_zones dz on dz.city = o.dropoff_city
where o.delivery_method = 'platform'
group by 1, 2;

create or replace view public.kpi_catalog
with (security_invoker = true) as
select
  count(*) filter (where status = 'active')          as active_listings,
  count(*) filter (where status = 'pending_review')  as pending_review,
  count(*) filter (where status = 'sold')            as sold_listings,
  count(*) filter (where status = 'expired')         as expired_listings
from public.listings;
