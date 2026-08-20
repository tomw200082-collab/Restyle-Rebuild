import type { ZoneLookup } from './types';

export type ZoneRow = { city: string; zone: 'A' | 'B' | 'C'; fee_agorot: number };

/**
 * Builds the pure lookup the fee engine takes. Lives apart from config.ts so
 * client components can import it without dragging in `server-only`.
 */
export function zoneLookupFrom(zones: ZoneRow[]): ZoneLookup {
  const map = new Map(zones.map((z) => [z.city, { zone: z.zone, fee_agorot: z.fee_agorot }]));
  return (city: string) => map.get(city) ?? null;
}
