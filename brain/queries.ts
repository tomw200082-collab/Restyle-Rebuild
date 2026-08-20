/**
 * The one place `brain/` reads the database.
 *
 * Every function here selects from a `brain_*` view and nothing else. The views
 * are the sanctioned definitions of these metrics `[D-77]`; a number recomputed
 * inline in a report disagrees with the dashboard within a month, and then
 * nobody knows which one is real.
 *
 * **Read-only, and structurally so.** This module has no write path and takes
 * the anon key rather than a service-role key — every `brain_*` view is
 * `security_invoker`, so RLS applies to the caller exactly as it does in the
 * browser. A brief that could write is a brief that could be wrong in a way
 * that outlives the morning.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Money = number;

export type DailyMoney = {
  day: string;
  orders_created: number;
  orders_completed: number;
  orders_cancelled: number;
  gmv_agorot: Money;
  take_agorot: Money;
  delivery_revenue_agorot: Money;
  refunded_agorot: Money;
};

export type SellThrough = {
  active_listings: number;
  sold_listings: number;
  awaiting_review: number;
  paused_listings: number;
  expired_listings: number;
  sell_through_pct: number | null;
  median_days_to_sale: number | null;
};

export type ReviewQueue = { waiting: number; oldest_hours: number | null; avg_wait_hours: number | null };

export type Offers = {
  total_offers: number;
  accepted: number;
  declined: number;
  expired: number;
  pending: number;
  acceptance_pct: number | null;
  avg_offer_pct_of_ask: number | null;
};

export type Delivery = {
  size_class: 'standard' | 'bulky';
  zone: string;
  deliveries: number;
  avg_lead_days: number | null;
  charged_agorot: Money;
  actual_cost_agorot: Money;
  margin_agorot: Money;
};

export type CategoryLiquidity = {
  slug: string;
  category: string;
  active_listings: number;
  sold_listings: number;
  active_bulky: number;
  sell_through_pct: number | null;
  avg_active_price_agorot: number | null;
};

export type SellerResponse = {
  requests: number;
  confirmed: number;
  timed_out: number;
  awaiting_now: number;
  confirm_rate_pct: number | null;
  avg_hours_to_confirm: number | null;
  sellers_paused: number;
};

export type StuckOrder = {
  id: string;
  status: string;
  created_at: string;
  age_hours: number;
  why: string;
};

export type BrainSnapshot = {
  /** The moment the snapshot was taken. A number without its as-of is not a measurement. */
  at: string;
  target: string;
  days: DailyMoney[];
  sellThrough: SellThrough | null;
  reviewQueue: ReviewQueue | null;
  offers: Offers | null;
  delivery: Delivery[];
  liquidity: CategoryLiquidity[];
  sellerResponse: SellerResponse | null;
  stuck: StuckOrder[];
};

export function brainClient(): { client: SupabaseClient; target: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. ' +
        'brain/ is read-only and never needs a service-role key.',
    );
  }
  return {
    client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    target: url,
  };
}

/** Every read destructures and throws its error. A swallowed one renders a brief of zeroes. [D-47] */
async function rows<T>(client: SupabaseClient, view: string, query: (q: never) => unknown): Promise<T[]> {
  const builder = client.from(view).select('*') as never;
  const { data, error } = (await query(builder)) as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`${view}: ${error.message}`);
  return data ?? [];
}

export async function snapshot(dayCount = 14): Promise<BrainSnapshot> {
  const { client, target } = brainClient();

  const [days, sellThrough, reviewQueue, offers, delivery, liquidity, sellerResponse, stuck] =
    await Promise.all([
      rows<DailyMoney>(client, 'brain_daily_money', (q) =>
        (q as unknown as { order: (c: string, o: object) => { limit: (n: number) => unknown } })
          .order('day', { ascending: false })
          .limit(dayCount),
      ),
      rows<SellThrough>(client, 'brain_sell_through', (q) => q),
      rows<ReviewQueue>(client, 'brain_review_queue', (q) => q),
      rows<Offers>(client, 'brain_offers', (q) => q),
      rows<Delivery>(client, 'brain_delivery', (q) => q),
      rows<CategoryLiquidity>(client, 'brain_category_liquidity', (q) =>
        (q as unknown as { order: (c: string, o: object) => unknown }).order('active_listings', {
          ascending: false,
        }),
      ),
      rows<SellerResponse>(client, 'brain_seller_response', (q) => q),
      rows<StuckOrder>(client, 'brain_stuck_orders', (q) =>
        (q as unknown as { order: (c: string, o: object) => unknown }).order('age_hours', {
          ascending: false,
        }),
      ),
    ]);

  return {
    at: new Date().toISOString(),
    target,
    days,
    sellThrough: sellThrough[0] ?? null,
    reviewQueue: reviewQueue[0] ?? null,
    offers: offers[0] ?? null,
    delivery,
    liquidity,
    sellerResponse: sellerResponse[0] ?? null,
    stuck,
  };
}
