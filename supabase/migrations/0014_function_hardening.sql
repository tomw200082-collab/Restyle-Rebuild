-- 0014 — lock down function execution.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and Supabase
-- exposes every function in `public` as an RPC endpoint at /rest/v1/rpc/<name>.
-- Together that meant the guarded state-machine functions were reachable by
-- anonymous callers: anyone could POST to /rest/v1/rpc/transition_order and
-- move someone else's order to `completed`, or call create_order with an
-- item price of zero. The RLS design assumed those functions were internal;
-- this migration makes that true. [D-44]
--
-- Split:
--   * mutating definer functions  -> service_role only. Server actions call
--     them through the service client and do their own authorization first.
--   * predicate functions (is_admin, owns_order) -> must stay executable by
--     anon and authenticated, because RLS policy expressions are evaluated
--     with the caller's privileges and these appear inside those policies.
--   * trigger functions -> nobody needs to call them directly; triggers fire
--     without an EXECUTE check on the invoking role.

-- Trigger functions were also flagged for a mutable search_path: without a
-- pinned path, a caller-controlled search_path can shadow the objects the
-- function body resolves.
create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.order_events_immutable() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'order_events is append-only' using errcode = 'check_violation';
end $$;

-- --- Mutating definer functions: service_role only --------------------------
do $$
declare
  fn text;
  fns text[] := array[
    'public.create_order(uuid, uuid, bigint, bigint, jsonb, bigint, bigint, bigint, bigint, text, text, uuid, text, text, integer, boolean, text)',
    'public.transition_order(uuid, public.order_status, uuid, text, jsonb)',
    'public.transition_listing(uuid, public.listing_status, uuid, text)',
    'public.release_listing_for_order(uuid, uuid)',
    'public.mark_listing_sold_for_order(uuid, uuid)',
    'public.record_order_event(uuid, uuid, text, jsonb)',
    'public.handle_new_user()',
    'public.touch_updated_at()',
    'public.order_events_immutable()'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- --- Predicate functions: needed by RLS, so keep them callable ---------------
-- They disclose nothing beyond what the caller already knows about itself:
-- is_admin() answers "am I an admin", owns_order() answers "is this my order".
do $$
declare
  fn text;
  fns text[] := array[
    'public.is_admin()',
    'public.owns_order(uuid)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to anon, authenticated, service_role', fn);
  end loop;
end $$;
