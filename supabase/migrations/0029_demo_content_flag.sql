-- 0029 — the demo-content flag.
--
-- A live catalogue with nothing in it is not testable and not showable: an item
-- page needs an item, a Product JSON-LD block needs a price, a sold-page check
-- needs a sold item, and a Lighthouse budget on `/item/[slug]` needs a
-- `/item/[slug]`. Five release-gate stages are `skipped` for exactly this
-- reason, and a skip is never a pass.
--
-- So there will be demo rows in the production database, and the only question
-- that matters is whether every one of them can be found and removed later
-- **without touching anything else**. That is what this column is for.
--
-- The operator seeded the reference data — 12 categories, 12 brands, 21
-- delivery zones — by hand, and some of it was then corrected in place rather
-- than replaced, precisely so their row ids survived. [D-57] A purge that
-- worked by "delete everything that looks like test data" would eventually take
-- those with it. A purge that deletes `where is_demo` cannot. [D-75]
--
-- Flagged rather than segregated into a separate schema because these rows must
-- be *indistinguishable to the application*: the point is to exercise the real
-- catalogue, the real fee engine and the real item page. A demo listing that
-- took a different code path would prove nothing.

alter table public.listings
  add column if not exists is_demo boolean not null default false;

alter table public.profiles
  add column if not exists is_demo boolean not null default false;

comment on column public.listings.is_demo is
  'Demo content, removable by scripts/purge-demo.ts. Never set on a real '
  'seller''s listing, and never true for reference data. [D-75]';

-- The purge and the admin filter both look up by this flag, and both should
-- stay fast when the demo set is a rounding error next to real inventory.
create index if not exists listings_is_demo_idx on public.listings (is_demo) where is_demo;
create index if not exists profiles_is_demo_idx on public.profiles (is_demo) where is_demo;

-- 0016 revoked the table-level SELECT on `listings` and re-grants column by
-- column, so a column added later is not readable until it is granted. That is
-- the mechanism working; `is_demo` is granted deliberately, because the
-- catalogue is allowed to know which of its rows are demonstrations. [D-45]
grant select (is_demo) on public.listings to anon, authenticated;
