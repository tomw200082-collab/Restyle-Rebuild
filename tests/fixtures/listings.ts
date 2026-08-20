import { LISTINGS } from '../../db/seed-data';
import { buildSlug } from '../../src/lib/seo/slug';

/**
 * Deterministic fixture lookup. Specs must target a listing whose pickup city,
 * status and price they know — asserting against "the first card in the
 * catalogue" couples the test to sort order and to how many rows happen to fit
 * on a page.
 */
export function seedListing(title: string) {
  const listing = LISTINGS.find((l) => l.title === title);
  if (!listing) throw new Error(`no seeded listing titled "${title}"`);
  return { ...listing, slug: buildSlug(listing.title, listing.id) };
}

/** A Tel Aviv (zone A) listing, so cross-zone maths is predictable. */
export const TEL_AVIV_SOFA = 'ספה תלת מושבית איקאה בד אפור';

/** A sold listing, for the "sold stays live" assertions. */
export const SOLD_DRESSER = 'שידה עתיקה משופצת';
