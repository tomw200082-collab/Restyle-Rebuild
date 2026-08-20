-- 0027 — the `paused` listing status.
--
-- Alone in its own migration, and that is not tidiness.
--
-- Postgres allows `alter type ... add value` inside a transaction block, but it
-- forbids *using* the new value in that same transaction — so the migration
-- that adds `paused` cannot also insert the transition rows that mention it.
-- The alternative is a `commit;` in the middle of a migration file, which ends
-- the runner's transaction early and silently gives up the property that makes
-- the runner safe: each migration is one transaction, so a failure leaves no
-- partial schema. A second file costs nothing and keeps that true. [D-74]
--
-- `if not exists` makes it idempotent; no exception handler is needed, and none
-- would work — this error is not catchable in plpgsql.

alter type public.listing_status add value if not exists 'paused';
