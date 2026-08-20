-- 0017 — make seller identity joinable.
--
-- `listings.seller_id` referenced only `auth.users`, so PostgREST had no path
-- from a listing to its seller's profile and every screen that shows a seller
-- needed a second round trip — including the item page, which is the hottest
-- page in the product.
--
-- `profiles.id` is itself a primary key referencing `auth.users(id)`, and the
-- profile row is created by a synchronous trigger on user insert, so this
-- constraint is always satisfiable: a listing cannot exist before its seller,
-- and a seller cannot exist before their profile.

do $$ begin
  alter table public.listings
    add constraint listings_seller_profile_fk
    foreign key (seller_id) references public.profiles(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders
    add constraint orders_buyer_profile_fk
    foreign key (buyer_id) references public.profiles(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.orders
    add constraint orders_seller_profile_fk
    foreign key (seller_id) references public.profiles(id) on delete restrict;
exception when duplicate_object then null; end $$;
