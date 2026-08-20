import { describe, expect, it } from 'vitest';
import {
  OutOfServiceAreaError,
  computeOrderPricing,
  minimumOfferAgorot,
  sellerPayoutFor,
} from '@/lib/pricing/engine';
import type { PricingConfig, PricingListing, ZoneLookup } from '@/lib/pricing/types';

const config: PricingConfig = {
  commission_pct: 20,
  floor_surcharge_agorot: 5000,
  floor_surcharge_min_floor: 3,
  disassembly_surcharge_agorot: 10000,
  cancellation_fee_agorot: 5000,
  offer_min_pct: 60,
  min_price_agorot: 5000,
};

const ZONES: Record<string, { zone: 'A' | 'B' | 'C'; fee_agorot: number }> = {
  'תל אביב-יפו': { zone: 'A', fee_agorot: 14900 },
  'רמת גן': { zone: 'A', fee_agorot: 14900 },
  חולון: { zone: 'B', fee_agorot: 19900 },
  'כפר סבא': { zone: 'C', fee_agorot: 24900 },
};

const lookupZone: ZoneLookup = (city) => ZONES[city] ?? null;

const listing = (over: Partial<PricingListing> = {}): PricingListing => ({
  price_agorot: 100_000, // ₪1,000
  pickup_city: 'תל אביב-יפו',
  pickup_floor: 0,
  pickup_has_elevator: false,
  needs_disassembly: false,
  ...over,
});

describe('zone fees', () => {
  it('charges the destination zone fee', () => {
    const p = computeOrderPricing(
      listing(),
      { method: 'platform', city: 'תל אביב-יפו', floor: 1, hasElevator: true },
      config,
      lookupZone,
    );
    expect(p.zone).toBe('A');
    expect(p.delivery_agorot).toBe(14900);
    expect(p.total_agorot).toBe(114900);
  });

  it('charges the HIGHER zone when pickup and dropoff differ', () => {
    // Zone A pickup, zone C dropoff -> C. The crew crosses the whole distance
    // regardless of which end is closer.
    const p = computeOrderPricing(
      listing({ pickup_city: 'תל אביב-יפו' }),
      { method: 'platform', city: 'כפר סבא', floor: 0, hasElevator: false },
      config,
      lookupZone,
    );
    expect(p.zone).toBe('C');
    expect(p.delivery_agorot).toBe(24900);
  });

  it('charges the higher zone in the other direction too', () => {
    const p = computeOrderPricing(
      listing({ pickup_city: 'כפר סבא' }),
      { method: 'platform', city: 'תל אביב-יפו', floor: 0, hasElevator: false },
      config,
      lookupZone,
    );
    expect(p.zone).toBe('C');
    expect(p.delivery_agorot).toBe(24900);
  });

  it('refuses a destination outside the service area, in Hebrew', () => {
    expect(() =>
      computeOrderPricing(
        listing(),
        { method: 'platform', city: 'אילת', floor: 0, hasElevator: false },
        config,
        lookupZone,
      ),
    ).toThrow(OutOfServiceAreaError);

    try {
      computeOrderPricing(
        listing(),
        { method: 'platform', city: 'אילת', floor: 0, hasElevator: false },
        config,
        lookupZone,
      );
    } catch (err) {
      expect((err as Error).message).toBe('מצטערים, המשלוח זמין רק באזור גוש דן');
    }
  });
});

describe('floor surcharge', () => {
  it('charges per side independently — both walk-ups cost twice', () => {
    const p = computeOrderPricing(
      listing({ pickup_floor: 4, pickup_has_elevator: false }),
      { method: 'platform', city: 'תל אביב-יפו', floor: 4, hasElevator: false },
      config,
      lookupZone,
    );
    expect(p.surcharges.map((s) => s.code)).toEqual(['floor_pickup', 'floor_dropoff']);
    expect(p.surcharges_agorot).toBe(10000);
  });

  it('charges one side when only one end is a walk-up', () => {
    const p = computeOrderPricing(
      listing({ pickup_floor: 5, pickup_has_elevator: false }),
      { method: 'platform', city: 'תל אביב-יפו', floor: 5, hasElevator: true },
      config,
      lookupZone,
    );
    expect(p.surcharges.map((s) => s.code)).toEqual(['floor_pickup']);
    expect(p.surcharges_agorot).toBe(5000);
  });

  it('does not charge below the third floor', () => {
    const p = computeOrderPricing(
      listing({ pickup_floor: 2, pickup_has_elevator: false }),
      { method: 'platform', city: 'תל אביב-יפו', floor: 2, hasElevator: false },
      config,
      lookupZone,
    );
    expect(p.surcharges).toEqual([]);
  });

  it('a lift suppresses the surcharge at any floor', () => {
    const p = computeOrderPricing(
      listing({ pickup_floor: 17, pickup_has_elevator: true }),
      { method: 'platform', city: 'תל אביב-יפו', floor: 20, hasElevator: true },
      config,
      lookupZone,
    );
    expect(p.surcharges).toEqual([]);
  });

  it('ground floor never surcharges', () => {
    const p = computeOrderPricing(
      listing({ pickup_floor: 0, pickup_has_elevator: false }),
      { method: 'platform', city: 'תל אביב-יפו', floor: 0, hasElevator: false },
      config,
      lookupZone,
    );
    expect(p.surcharges).toEqual([]);
  });
});

describe('disassembly surcharge', () => {
  it('is charged once, not per side', () => {
    const p = computeOrderPricing(
      listing({ needs_disassembly: true }),
      { method: 'platform', city: 'תל אביב-יפו', floor: 0, hasElevator: true },
      config,
      lookupZone,
    );
    expect(p.surcharges.filter((s) => s.code === 'disassembly')).toHaveLength(1);
    expect(p.surcharges_agorot).toBe(10000);
  });
});

describe('self-pickup', () => {
  it('costs the item price alone — no delivery, no floors, no disassembly', () => {
    // Every one of those charges pays a crew. On self-pickup there is no crew.
    const p = computeOrderPricing(
      listing({ pickup_floor: 8, pickup_has_elevator: false, needs_disassembly: true }),
      { method: 'self_pickup' },
      config,
      lookupZone,
    );
    expect(p.delivery_agorot).toBe(0);
    expect(p.surcharges).toEqual([]);
    expect(p.surcharges_agorot).toBe(0);
    expect(p.total_agorot).toBe(p.item_agorot);
    expect(p.zone).toBeNull();
  });

  it('does not consult the zone table at all, so an out-of-area buyer can still self-collect', () => {
    const p = computeOrderPricing(listing(), { method: 'self_pickup' }, config, () => null);
    expect(p.total_agorot).toBe(100_000);
  });
});

describe('commission', () => {
  it('takes 20% and leaves the rest to the seller', () => {
    const p = computeOrderPricing(listing(), { method: 'self_pickup' }, config, lookupZone);
    expect(p.commission_agorot).toBe(20_000);
    expect(p.seller_payout_agorot).toBe(80_000);
  });

  it('rounds DOWN, so rounding never creates money', () => {
    // 20% of 33,333 = 6,666.6 -> 6,666
    const p = computeOrderPricing(
      listing({ price_agorot: 33_333 }),
      { method: 'self_pickup' },
      config,
      lookupZone,
    );
    expect(p.commission_agorot).toBe(6_666);
    expect(p.seller_payout_agorot).toBe(26_667);
  });

  it('always satisfies commission + payout === item, for every price', () => {
    // This is exactly the database's balance constraint; if the engine can
    // violate it the insert fails at checkout rather than at reconciliation.
    for (let price = 5_000; price <= 500_000; price += 997) {
      const p = computeOrderPricing(
        listing({ price_agorot: price }),
        { method: 'self_pickup' },
        config,
        lookupZone,
      );
      expect(p.commission_agorot + p.seller_payout_agorot).toBe(price);
    }
  });

  it('always satisfies total === item + delivery + surcharges', () => {
    for (const floor of [0, 3, 9]) {
      for (const city of ['תל אביב-יפו', 'חולון', 'כפר סבא']) {
        const p = computeOrderPricing(
          listing({ pickup_floor: floor, needs_disassembly: floor > 0 }),
          { method: 'platform', city, floor, hasElevator: false },
          config,
          lookupZone,
        );
        expect(p.total_agorot).toBe(p.item_agorot + p.delivery_agorot + p.surcharges_agorot);
      }
    }
  });

  it('is charged on the price actually paid, not the asking price', () => {
    // An accepted offer of ₪600 against a ₪1,000 ask is taxed at ₪600, or the
    // effective rate on every negotiated sale would silently rise.
    const p = computeOrderPricing(
      listing({ price_agorot: 100_000 }),
      { method: 'self_pickup' },
      config,
      lookupZone,
      { itemPriceOverride: 60_000 },
    );
    expect(p.item_agorot).toBe(60_000);
    expect(p.commission_agorot).toBe(12_000);
    expect(p.seller_payout_agorot).toBe(48_000);
  });

  it('honours a zero-commission override for the published free-resale promise', () => {
    const p = computeOrderPricing(
      listing({ commission_pct_override: 0 }),
      { method: 'self_pickup' },
      config,
      lookupZone,
    );
    expect(p.commission_agorot).toBe(0);
    expect(p.seller_payout_agorot).toBe(100_000);
  });
});

describe('seller-facing helpers', () => {
  it('sellerPayoutFor matches what the engine computes', () => {
    for (const price of [5_000, 49_999, 100_000, 450_000]) {
      const engine = computeOrderPricing(
        listing({ price_agorot: price }),
        { method: 'self_pickup' },
        config,
        lookupZone,
      );
      expect(sellerPayoutFor(price, config)).toBe(engine.seller_payout_agorot);
    }
  });

  it('minimumOfferAgorot rounds UP, so the floor is never undercut', () => {
    // 60% of 33,333 = 19,999.8 -> 20,000
    expect(minimumOfferAgorot(33_333, config)).toBe(20_000);
    expect(minimumOfferAgorot(100_000, config)).toBe(60_000);
  });
});
