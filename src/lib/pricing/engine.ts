import type {
  DeliveryDetails,
  DeliveryZone,
  OrderPricing,
  PricingConfig,
  PricingListing,
  Surcharge,
  ZoneLookup,
} from './types';

/**
 * The fee engine. Pure, no I/O, and the single source of truth used by the
 * checkout UI, by server-side validation, and by admin.
 *
 * Fee logic duplicated between client and server is the classic marketplace
 * bug: the buyer sees one total and the server charges another. One pure
 * function cannot drift from itself. [D-18]
 *
 * Every amount is integer agorot. [D-01]
 */

export class OutOfServiceAreaError extends Error {
  constructor(public readonly city: string) {
    // Reused verbatim from the legacy ShippingEngine — it is already the
    // wording customers have seen. [LI 3]
    super('מצטערים, המשלוח זמין רק באזור גוש דן');
    this.name = 'OutOfServiceAreaError';
  }
}

const ZONE_RANK: Record<DeliveryZone, number> = { A: 1, B: 2, C: 3 };

/**
 * Cross-zone orders charge the higher zone: the crew has to cross the whole
 * distance regardless of which end is closer. [MP 3.5]
 */
function higherZone(
  a: { zone: DeliveryZone; fee_agorot: number },
  b: { zone: DeliveryZone; fee_agorot: number },
) {
  return ZONE_RANK[a.zone] >= ZONE_RANK[b.zone] ? a : b;
}

/**
 * The floor surcharge is evaluated independently per side. The crew carries
 * the item down at pickup and up at dropoff — physically separate efforts, so
 * a walk-up at both ends is genuinely twice the work. A lift at either end
 * suppresses that side's surcharge at any floor. [D-07]
 */
function floorSurcharge(
  side: 'pickup' | 'dropoff',
  floor: number,
  hasElevator: boolean,
  config: PricingConfig,
): Surcharge | null {
  if (hasElevator) return null;
  if (floor < config.floor_surcharge_min_floor) return null;

  return {
    code: side === 'pickup' ? 'floor_pickup' : 'floor_dropoff',
    label: side === 'pickup' ? 'תוספת קומה — איסוף' : 'תוספת קומה — מסירה',
    amount_agorot: config.floor_surcharge_agorot,
  };
}

export function computeOrderPricing(
  listing: PricingListing,
  delivery: DeliveryDetails,
  config: PricingConfig,
  lookupZone: ZoneLookup,
  options: { itemPriceOverride?: number } = {},
): OrderPricing {
  // Commission is charged on the price actually paid, so an accepted offer is
  // taxed at its own amount rather than at the original asking price. [D-09]
  const item_agorot = options.itemPriceOverride ?? listing.price_agorot;

  let delivery_agorot = 0;
  let zone: DeliveryZone | null = null;
  const surcharges: Surcharge[] = [];

  if (delivery.method === 'platform') {
    const dropoff = lookupZone(delivery.city);
    if (!dropoff) throw new OutOfServiceAreaError(delivery.city);

    const pickup = lookupZone(listing.pickup_city);
    const charged = pickup ? higherZone(pickup, dropoff) : dropoff;

    zone = charged.zone;
    delivery_agorot = charged.fee_agorot;

    const pickupSurcharge = floorSurcharge(
      'pickup',
      listing.pickup_floor,
      listing.pickup_has_elevator,
      config,
    );
    if (pickupSurcharge) surcharges.push(pickupSurcharge);

    const dropoffSurcharge = floorSurcharge('dropoff', delivery.floor, delivery.hasElevator, config);
    if (dropoffSurcharge) surcharges.push(dropoffSurcharge);

    if (listing.needs_disassembly) {
      surcharges.push({
        code: 'disassembly',
        label: 'פירוק והרכבה',
        amount_agorot: config.disassembly_surcharge_agorot,
      });
    }
  }
  // Self-pickup carries no delivery charges at all — no crew, no carrying, and
  // no disassembly performed by the platform. Charging for work the platform
  // does not do would be indefensible at the first support ticket. [D-08]

  const surcharges_agorot = surcharges.reduce((sum, s) => sum + s.amount_agorot, 0);
  const total_agorot = item_agorot + delivery_agorot + surcharges_agorot;

  const pct = listing.commission_pct_override ?? config.commission_pct;

  // Rounding down means rounding error never creates money, and the residual
  // agora favours the seller. Payout is derived by subtraction so that
  // commission + payout === item exactly, which is what the database's balance
  // constraint requires and what the payout ledger reconciles against. [D-10]
  const commission_agorot = Math.floor((item_agorot * pct) / 100);
  const seller_payout_agorot = item_agorot - commission_agorot;

  return {
    item_agorot,
    delivery_agorot,
    surcharges,
    surcharges_agorot,
    total_agorot,
    commission_agorot,
    seller_payout_agorot,
    zone,
  };
}

/** What a seller receives — shown live beside the price input. [D-36] */
export function sellerPayoutFor(priceAgorot: number, config: PricingConfig, overridePct?: number | null): number {
  const pct = overridePct ?? config.commission_pct;
  return priceAgorot - Math.floor((priceAgorot * pct) / 100);
}

/** The lowest offer the seller will be shown. [MP 3.4] */
export function minimumOfferAgorot(priceAgorot: number, config: PricingConfig): number {
  return Math.ceil((priceAgorot * config.offer_min_pct) / 100);
}
