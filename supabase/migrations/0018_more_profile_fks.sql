-- 0018 — the remaining profile joins.
--
-- Same reasoning as 0017: these columns referenced only `auth.users`, so
-- PostgREST had no path to the profile and every screen showing a person's
-- name needed a second query. The profile row is created by a synchronous
-- trigger on user insert, so the constraint is always satisfiable.

do $$ begin
  alter table public.payouts
    add constraint payouts_seller_profile_fk
    foreign key (seller_id) references public.profiles(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.offers
    add constraint offers_buyer_profile_fk
    foreign key (buyer_id) references public.profiles(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.disputes
    add constraint disputes_opener_profile_fk
    foreign key (opened_by) references public.profiles(id) on delete restrict;
exception when duplicate_object then null; end $$;
