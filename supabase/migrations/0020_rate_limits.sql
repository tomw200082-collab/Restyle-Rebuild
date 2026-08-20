-- 0020 — request rate limiting.
--
-- Counted in Postgres rather than in memory. The application runs as serverless
-- functions: an in-process counter is per-instance and resets on every cold
-- start, so under any real traffic it limits almost nothing while looking like
-- it works. One shared table is the only place the count is true.

create table if not exists public.rate_limits (
  bucket      text        not null,
  subject     text        not null,
  window_start timestamptz not null,
  count       integer     not null default 0,
  primary key (bucket, subject, window_start)
);

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

/*
 * Consumes one unit and reports whether it was allowed.
 *
 * A fixed window, not a sliding one: it is one upsert, it cannot deadlock, and
 * the worst case — 2× the limit across a window boundary — is irrelevant for
 * the things being protected here (a metered AI call, offer spam, dispute
 * spam). A sliding window would cost a row per request and a periodic sweep.
 *
 * `insert … on conflict do update` is atomic, so two concurrent requests in the
 * same window cannot both read the old count and both write limit-1.
 *
 * Lives in `public` rather than `private` because it is called over PostgREST,
 * which only resolves exposed schemas — and it is revoked from every role but
 * `service_role`, the same shape as the other mutating definer functions.
 * [D-44]
 */
create or replace function public.consume_rate_limit(
  p_bucket  text,
  p_subject text,
  p_limit   integer,
  p_window_seconds integer
) returns table (allowed boolean, remaining integer, resets_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  -- Floor the clock to the window, so every request in the same window agrees
  -- on the key without any coordination.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, subject, window_start, count)
       values (p_bucket, p_subject, v_window_start, 1)
  on conflict (bucket, subject, window_start)
    do update set count = public.rate_limits.count + 1
    returning public.rate_limits.count into v_count;

  return query select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_window_start + make_interval(secs => p_window_seconds);
end $$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;

/*
 * Old windows are dead weight; nothing reads them once they have passed.
 * Called by the daily cron rather than a trigger, so a burst of traffic never
 * pays for the cleanup.
 */
create or replace function public.prune_rate_limits(p_older_than interval default '2 days')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_deleted integer;
begin
  delete from public.rate_limits where window_start < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke all on function public.prune_rate_limits(interval) from public, anon, authenticated;
grant execute on function public.prune_rate_limits(interval) to service_role;
