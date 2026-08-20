-- 0010 — atomic order creation.
-- The legacy app created the order and "reserved" the item from the browser in
-- separate calls, so the reservation was never actually atomic. [LI 4]
-- Here, reserving the listing and creating the order are one statement under a
-- row lock, which is what makes first-capture-wins correct for offers. [D-15]

create or replace function public.create_order(
  p_listing_id           uuid,
  p_buyer_id             uuid,
  p_item_agorot          bigint,
  p_delivery_agorot      bigint,
  p_surcharges           jsonb,
  p_surcharges_agorot    bigint,
  p_total_agorot         bigint,
  p_commission_agorot    bigint,
  p_seller_payout_agorot bigint,
  p_delivery_method      text,
  p_payment_provider     text,
  p_offer_id             uuid    default null,
  p_dropoff_city         text    default null,
  p_dropoff_street       text    default null,
  p_dropoff_floor        int     default null,
  p_dropoff_has_elevator boolean default null,
  p_dropoff_notes        text    default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_listing public.listings;
  v_order   public.orders;
begin
  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'listing % not found', p_listing_id using errcode = 'no_data_found';
  end if;

  if v_listing.status <> 'active' then
    raise exception 'listing % is not available (status: %)', p_listing_id, v_listing.status
      using errcode = 'check_violation';
  end if;

  if v_listing.seller_id = p_buyer_id then
    raise exception 'a seller cannot buy their own listing' using errcode = 'check_violation';
  end if;

  insert into public.orders (
    listing_id, buyer_id, seller_id, offer_id, status,
    item_agorot, delivery_agorot, surcharges, surcharges_agorot, total_agorot,
    commission_agorot, seller_payout_agorot,
    delivery_method, dropoff_city, dropoff_street, dropoff_floor,
    dropoff_has_elevator, dropoff_notes, payment_provider
  ) values (
    p_listing_id, p_buyer_id, v_listing.seller_id, p_offer_id, 'pending_seller_confirmation',
    p_item_agorot, p_delivery_agorot, coalesce(p_surcharges, '[]'::jsonb),
    p_surcharges_agorot, p_total_agorot,
    p_commission_agorot, p_seller_payout_agorot,
    p_delivery_method, p_dropoff_city, p_dropoff_street, p_dropoff_floor,
    p_dropoff_has_elevator, p_dropoff_notes, p_payment_provider
  ) returning * into v_order;

  perform public.transition_listing(p_listing_id, 'reserved', p_buyer_id);

  insert into public.order_events (order_id, actor_id, type, payload)
  values (v_order.id, p_buyer_id, 'order_created',
          jsonb_build_object('listing_id', p_listing_id, 'total_agorot', p_total_agorot,
                             'offer_id', p_offer_id));

  return v_order;
end $$;

-- Releasing a listing when an order ends without a sale. Also idempotent.
create or replace function public.release_listing_for_order(
  p_order_id uuid,
  p_actor    uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return; end if;

  if exists (select 1 from public.listings
              where id = v_order.listing_id and status = 'reserved') then
    perform public.transition_listing(v_order.listing_id, 'active', p_actor);
  end if;
end $$;

-- Marking the sale once an order is delivered.
create or replace function public.mark_listing_sold_for_order(
  p_order_id uuid,
  p_actor    uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then return; end if;

  if exists (select 1 from public.listings
              where id = v_order.listing_id and status = 'reserved') then
    perform public.transition_listing(v_order.listing_id, 'sold', p_actor);
  end if;
end $$;
