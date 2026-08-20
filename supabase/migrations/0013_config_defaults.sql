-- 0013 — runtime configuration defaults.
-- Inserted here (not only in the seed) so a freshly migrated database is
-- immediately functional: the profile trigger and the fee engine both read
-- from this table. db/seed.ts upserts the same keys, so the two agree.

insert into public.site_config (key, value, description, is_public) values
  ('commission_pct',            '20'::jsonb,
   'Platform commission, percent of the item price, deducted from the seller payout.', true),
  ('commission_tiers',          '[]'::jsonb,
   'Reserved for future tiered commission. Unused.', true),
  ('offer_min_pct',             '60'::jsonb,
   'Minimum offer as a percent of the asking price.', true),
  ('offer_expiry_hours',        '72'::jsonb,
   'How long a pending offer stays open.', true),
  ('offer_checkout_hours',      '24'::jsonb,
   'Exclusive checkout window granted to an accepted offer.', true),
  ('protection_hours',          '48'::jsonb,
   'Buyer protection window after delivery. Legacy published 12h/24h/48h in different places; v2 uses one value everywhere. [D-39]', true),
  ('seller_confirm_hours',      '48'::jsonb,
   'Seller confirmation window before auto-cancel and auto-refund.', true),
  ('seller_reminder_hours',     '24'::jsonb,
   'Send the seller a reminder this many hours into the confirmation window. [D-43]', true),
  ('listing_ttl_days',          '90'::jsonb,
   'Days before an active listing expires.', true),
  ('floor_surcharge_agorot',    '5000'::jsonb,
   'Per side, when floor >= 3 without a lift. Pickup and dropoff evaluated independently. [D-07]', true),
  ('floor_surcharge_min_floor', '3'::jsonb,
   'Floor at or above which the surcharge applies.', true),
  ('disassembly_surcharge_agorot', '10000'::jsonb,
   'Charged once when the item needs disassembly and reassembly.', true),
  ('cancellation_fee_agorot',   '5000'::jsonb,
   'Buyer cancellation after seller confirmation. Matches the published Terms and Cancellation Policy. Set to 0 to waive. [D-40]', true),
  ('resale_window_days',        '7'::jsonb,
   'Days after delivery in which a buyer may relist with zero commission. [D-41], [LI 7.6]', true),
  ('min_price_agorot',          '5000'::jsonb,
   'Minimum asking price.', true),
  ('capture_mode',              '"immediate"'::jsonb,
   'immediate | authorize_capture. The seam for a future J5 flow. [D-21]', true),
  ('min_photos',                '3'::jsonb, 'Minimum listing photos.', true),
  ('max_photos',                '10'::jsonb, 'Maximum listing photos.', true),
  ('admin_email',               '""'::jsonb,
   'Email granted the admin role at profile creation. Set by db/seed.ts from ADMIN_EMAIL. Not public. [D-29]', false)
on conflict (key) do nothing;
