/**
 * Legacy → v2 route map.
 *
 * The old app was a client-rendered SPA whose routes were PascalCase page
 * names. React Router matched case-insensitively while the app's own
 * `createPageUrl` emitted lowercase, so **both casings are in the wild** — in
 * already-sent emails and in whatever Google indexed. Matching one casing
 * would 404 half the inbound traffic this map exists to save. [D-42], [LI 6]
 *
 * Keys are lowercased paths without a leading slash.
 */
const STATIC_ROUTES: Record<string, string> = {
  // Content
  home: '/',
  catalog: '/catalog',
  howitworks: '/how-it-works',
  about: '/how-it-works',
  buyerprotection: '/buyer-protection',
  terms: '/terms',
  privacypolicy: '/privacy',
  accessibility: '/accessibility',
  cancellationpolicy: '/cancellation-policy',

  // Seller
  uploaditem: '/sell/new',
  uploadsuccess: '/sell/new/submitted',
  sellerdashboard: '/dashboard/seller',
  sellerresponsesuccess: '/dashboard/seller',
  selleranswer: '/dashboard/seller',
  verifyemail: '/login',

  // Buyer
  buyerdashboard: '/dashboard/buyer',
  favorites: '/dashboard/buyer',
  buyerresponsesuccess: '/dashboard/buyer',
  orderdetails: '/dashboard/buyer',
  opendispute: '/dashboard/buyer',

  // Checkout — the legacy flow does not map onto the new one, so these land on
  // the buyer's orders rather than a half-built checkout for an order that no
  // longer exists in that shape.
  checkout: '/catalog',
  checkoutdetails: '/catalog',
  paymentsuccess: '/dashboard/buyer',
  paymentcancelled: '/dashboard/buyer',
  scheduledelivery: '/dashboard/buyer',

  // Admin. Every generation of the old admin collapses onto the one that
  // exists now; the ?screen= parameter is mapped separately.
  adminv2: '/admin',
  adminv2entry: '/admin',
  admin: '/admin',
  admincockpit: '/admin',
  admindashboard: '/admin',
  adminquickaccess: '/admin',
  adminsupportrequests: '/admin',
  adminshippingcoordination: '/admin/orders',
};

/** `/AdminV2?screen=orders` → `/admin/orders`. */
const ADMIN_SCREENS: Record<string, string> = {
  dashboard: '/admin',
  review: '/admin/review',
  orders: '/admin/orders',
  disputes: '/admin/disputes',
  support: '/admin/disputes',
  qna: '/admin/listings',
  items: '/admin/listings',
  payouts: '/admin/payouts',
  shipping: '/admin/deliveries',
};

/** Paths whose target depends on a legacy record id looked up in the database. */
export const ID_ROUTES = new Set(['itemdetails', 'ordersuccess', 'sellerresponse', 'buyerresponse']);

export const LEGACY_ID = /^[0-9a-f]{24}$/i;

export type LegacyMatch =
  | { kind: 'static'; target: string }
  | { kind: 'lookup'; page: string; legacyId: string; fallback: string }
  | null;

/**
 * Classifies a legacy URL. Returns null for anything that isn't one, so the
 * middleware can fall straight through without touching the database.
 */
export function matchLegacyRoute(pathname: string, search: URLSearchParams): LegacyMatch {
  const page = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

  if (ID_ROUTES.has(page)) {
    const legacyId = search.get('id') ?? search.get('orderId') ?? search.get('orderid') ?? '';
    const fallback = page === 'itemdetails' ? '/catalog' : '/dashboard/buyer';
    if (LEGACY_ID.test(legacyId)) return { kind: 'lookup', page, legacyId, fallback };
    // An id-bearing route without a usable id still had intent; send it to the
    // nearest listing surface rather than to a 404.
    return { kind: 'static', target: fallback };
  }

  if (page === 'adminv2' || page === 'adminv2entry') {
    const screen = (search.get('screen') ?? '').toLowerCase();
    return { kind: 'static', target: ADMIN_SCREENS[screen] ?? '/admin' };
  }

  if (page === 'uploaditem' && search.get('reuploadId')) {
    return { kind: 'static', target: '/sell/new' };
  }

  const target = STATIC_ROUTES[page];
  return target ? { kind: 'static', target } : null;
}
