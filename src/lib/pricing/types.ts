import type { Enums } from '@/types/database';

export type DeliveryZone = 'A' | 'B' | 'C';

export type PricingConfig = {
  commission_pct: number;
  floor_surcharge_agorot: number;
  floor_surcharge_min_floor: number;
  disassembly_surcharge_agorot: number;
  cancellation_fee_agorot: number;
  offer_min_pct: number;
  min_price_agorot: number;
};

export type PricingListing = {
  price_agorot: number;
  pickup_city: string;
  pickup_floor: number;
  pickup_has_elevator: boolean;
  needs_disassembly: boolean;
  /** Zero-commission resale honours the published promise. [D-41] */
  commission_pct_override?: number | null;
};

export type DeliveryDetails =
  | { method: 'self_pickup' }
  | {
      method: 'platform';
      city: string;
      floor: number;
      hasElevator: boolean;
    };

export type SurchargeCode = 'floor_pickup' | 'floor_dropoff' | 'disassembly';

export type Surcharge = {
  code: SurchargeCode;
  label: string;
  amount_agorot: number;
};

export type OrderPricing = {
  item_agorot: number;
  delivery_agorot: number;
  surcharges: Surcharge[];
  surcharges_agorot: number;
  total_agorot: number;
  commission_agorot: number;
  seller_payout_agorot: number;
  /** Null when the destination is outside the service area. */
  zone: DeliveryZone | null;
};

export type ZoneLookup = (city: string) => { zone: DeliveryZone; fee_agorot: number } | null;

export type ListingCondition = Enums<'listing_condition'>;
