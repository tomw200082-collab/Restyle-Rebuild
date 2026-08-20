import 'server-only';

import { createPublicSupabase } from '@/lib/supabase/public';
import { tags } from '@/lib/cache/tags';
import type { PricingConfig } from './types';
export { zoneLookupFrom, type ZoneRow } from './config.shared';

const DEFAULTS: PricingConfig = {
  commission_pct: 20,
  floor_surcharge_agorot: 5000,
  floor_surcharge_min_floor: 3,
  disassembly_surcharge_agorot: 10000,
  cancellation_fee_agorot: 5000,
  offer_min_pct: 60,
  min_price_agorot: 5000,
};

export type SiteConfig = PricingConfig & {
  protection_hours: number;
  seller_confirm_hours: number;
  seller_reminder_hours: number;
  offer_expiry_hours: number;
  offer_checkout_hours: number;
  listing_ttl_days: number;
  resale_window_days: number;
  min_photos: number;
  max_photos: number;
  capture_mode: 'immediate' | 'authorize_capture';
};

const CONFIG_DEFAULTS: SiteConfig = {
  ...DEFAULTS,
  protection_hours: 48,
  seller_confirm_hours: 48,
  seller_reminder_hours: 24,
  offer_expiry_hours: 72,
  offer_checkout_hours: 24,
  listing_ttl_days: 90,
  resale_window_days: 7,
  min_photos: 3,
  max_photos: 10,
  capture_mode: 'immediate',
};

/**
 * Runtime config, editable from the admin console. Defaults exist so a missing
 * row degrades to the documented value rather than to NaN — the legacy app had
 * fee constants contradicting each other across four files. [LI 8.14]
 */
export async function getSiteConfig(): Promise<SiteConfig> {
  const supabase = createPublicSupabase({ tags: [tags.config] });
  const { data, error } = await supabase.from('site_config').select('key, value');
  if (error) return CONFIG_DEFAULTS;

  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const num = (key: keyof SiteConfig, fallback: number) => {
    const raw = map.get(key);
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    commission_pct: num('commission_pct', CONFIG_DEFAULTS.commission_pct),
    floor_surcharge_agorot: num('floor_surcharge_agorot', CONFIG_DEFAULTS.floor_surcharge_agorot),
    floor_surcharge_min_floor: num('floor_surcharge_min_floor', CONFIG_DEFAULTS.floor_surcharge_min_floor),
    disassembly_surcharge_agorot: num('disassembly_surcharge_agorot', CONFIG_DEFAULTS.disassembly_surcharge_agorot),
    cancellation_fee_agorot: num('cancellation_fee_agorot', CONFIG_DEFAULTS.cancellation_fee_agorot),
    offer_min_pct: num('offer_min_pct', CONFIG_DEFAULTS.offer_min_pct),
    min_price_agorot: num('min_price_agorot', CONFIG_DEFAULTS.min_price_agorot),
    protection_hours: num('protection_hours', CONFIG_DEFAULTS.protection_hours),
    seller_confirm_hours: num('seller_confirm_hours', CONFIG_DEFAULTS.seller_confirm_hours),
    seller_reminder_hours: num('seller_reminder_hours', CONFIG_DEFAULTS.seller_reminder_hours),
    offer_expiry_hours: num('offer_expiry_hours', CONFIG_DEFAULTS.offer_expiry_hours),
    offer_checkout_hours: num('offer_checkout_hours', CONFIG_DEFAULTS.offer_checkout_hours),
    listing_ttl_days: num('listing_ttl_days', CONFIG_DEFAULTS.listing_ttl_days),
    resale_window_days: num('resale_window_days', CONFIG_DEFAULTS.resale_window_days),
    min_photos: num('min_photos', CONFIG_DEFAULTS.min_photos),
    max_photos: num('max_photos', CONFIG_DEFAULTS.max_photos),
    capture_mode: map.get('capture_mode') === 'authorize_capture' ? 'authorize_capture' : 'immediate',
  };
}

import type { ZoneRow } from './config.shared';

export async function getDeliveryZones(): Promise<ZoneRow[]> {
  const supabase = createPublicSupabase({ tags: [tags.zones] });
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('city, zone, fee_agorot')
    .order('zone')
    .order('city');
  if (error) throw error;
  return (data ?? []) as ZoneRow[];
}
