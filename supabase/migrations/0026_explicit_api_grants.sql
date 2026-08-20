-- 0026 — the API-role grants, stated rather than inherited.
--
-- Found by CI. `npm run db:seed` failed against a stack created by
-- `supabase start` with:
--
--   42501 permission denied for table site_config
--   hint: GRANT SELECT, INSERT, UPDATE ON public.site_config TO service_role;
--
-- Nothing was wrong with the migrations' logic. The problem is what they did
-- *not* say: every grant the API roles hold on these tables came from
-- `ALTER DEFAULT PRIVILEGES`, set up by the environment, and applied only when
-- the table is created by the role those defaults belong to. Apply the same
-- files under a different role and the tables come out with no API grants at
-- all — RLS policies referring to roles that cannot reach the table.
--
-- The hosted project has the grants, so this has never been visible there. That
-- is exactly the failure mode worth naming: **a permission that works by
-- accident of environment is a permission nobody has checked.** It is the same
-- shape as [D-44] (EXECUTE granted to PUBLIC by default) and [D-45] (a
-- table-level grant nobody had written down) — both of which were real holes.
--
-- This migration is additive. Every grant here already exists on the hosted
-- project, so applying it there is a no-op and the object-level drift check
-- stays clean; on a fresh stack it is the difference between a working schema
-- and an unreachable one. [D-73]

do $$
declare
  v_table text;
  -- Reachable through PostgREST by anon and authenticated, with RLS deciding
  -- which rows. Everything not named here is service-role-only.
  v_public_tables text[] := array[
    'brands', 'categories', 'deliveries', 'delivery_zones', 'disputes',
    'favorites', 'legacy_redirects', 'listing_photos',
    'listing_status_transitions', 'offers', 'order_events',
    'order_status_transitions', 'orders', 'outbound_events', 'payouts',
    'profiles', 'saved_searches', 'site_config'
  ];
  -- RLS enabled, zero policies, and no grant to the API roles: two independent
  -- mechanisms saying the same thing, which is the point. `rate_limits` counts
  -- abuse, and the legacy tables are a read-only historical record that the
  -- application never queries. [D-53]
  v_service_only_tables text[] := array['rate_limits', 'legacy_users', 'legacy_orders'];
begin
  foreach v_table in array v_public_tables loop
    execute format('grant all on public.%I to anon, authenticated, service_role', v_table);
  end loop;

  foreach v_table in array v_service_only_tables loop
    execute format('revoke all on public.%I from anon, authenticated', v_table);
    execute format('grant all on public.%I to service_role', v_table);
  end loop;
end $$;

-- `listings` is deliberately not in either list.
--
-- 0016 revoked the table-level SELECT from anon and authenticated and re-granted
-- it column by column, so that the seller's street address is protected by a
-- privilege rather than by a policy — RLS is row-level and structurally cannot
-- protect a column — and so that a column added later is *not* granted and
-- fails closed. `grant all` here would undo all of that in one line and put
-- `pickup_street` back on every public read. [D-45]
--
-- So: writes and the service role, explicitly. Reads for anon and authenticated
-- stay exactly as 0016 and 0025 left them.
grant insert, update, delete on public.listings to anon, authenticated;
grant all on public.listings to service_role;

-- Sequences and functions follow the same reasoning: whatever the environment's
-- defaults happen to be, say it here.
grant usage on schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Not `grant execute on all functions`: that would re-open every
-- SECURITY DEFINER function to anon, which is precisely the hole 0014 closed.
-- Function grants stay enumerated one by one, where they can be read. [D-44]
