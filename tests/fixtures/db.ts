import pg from 'pg';
import { randomUUID } from 'node:crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/restyle';

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  return pool;
}

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

/**
 * Move a stored timestamp into the past, then run the job.
 *
 * The timers are evaluated in SQL against stored timestamps, so faking a
 * browser or Node clock would fool the wrong process entirely. Backdating the
 * row exercises the actual production query — including whether it compares
 * against the right column. [D-20]
 */
export async function backdate(table: string, id: string, column: string, hours: number) {
  // Table and column are test-authored literals, never user input; values are
  // still parameterised.
  if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(column)) {
    throw new Error('backdate() takes identifier literals only');
  }
  await sql(`update public.${table} set ${column} = now() - ($2 || ' hours')::interval where id = $1`, [
    id,
    String(hours),
  ]);
}

export async function runCron(job: string, baseUrl: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET is required to exercise the cron routes');

  const response = await fetch(`${baseUrl}/api/cron/${job}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });

  if (!response.ok) throw new Error(`cron ${job} failed: ${response.status}`);
  return (await response.json()) as { job: string; processed: number };
}

export const SELLER_ID = '00000000-0000-4000-8000-000000000002';
export const BUYER_ID = '00000000-0000-4000-8000-000000000003';
export const ADMIN_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Creates a fresh active listing so mutating specs never collide over a
 * shared seed row — and never depend on catalogue sort order.
 */
export async function createListing(
  overrides: Partial<{
    title: string;
    price_agorot: number;
    city: string;
    floor: number;
    elevator: boolean;
    disassembly: boolean;
    sellerId: string;
    allowSelfPickup: boolean;
  }> = {},
) {
  const id = randomUUID();
  const suffix = id.replace(/-/g, '').slice(0, 6);
  const title = overrides.title ?? `פריט בדיקה ${suffix}`;
  const slug = `test-listing-${suffix}`;

  const [category] = await sql<{ id: string }>(
    `select id from public.categories where slug = 'sofas-armchairs'`,
  );

  const [listing] = await sql<{ id: string; slug: string; title: string }>(
    `insert into public.listings (
       id, slug, seller_id, title, description, category_id, condition,
       width_cm, depth_cm, height_cm, price_agorot, status,
       pickup_city, pickup_street, pickup_floor, pickup_has_elevator,
       needs_disassembly, allow_self_pickup, published_at, expires_at
     ) values ($1, $2, $3, $4, 'פריט שנוצר על ידי מערכת הבדיקות', $5, 'good',
       200, 90, 80, $6, 'active', $7, 'רחוב הבדיקה 1', $8, $9, $10, $11,
       now(), now() + interval '90 days')
     returning id, slug, title`,
    [
      id,
      slug,
      overrides.sellerId ?? SELLER_ID,
      title,
      category!.id,
      overrides.price_agorot ?? 100_000,
      overrides.city ?? 'תל אביב-יפו',
      overrides.floor ?? 0,
      overrides.elevator ?? true,
      overrides.disassembly ?? false,
      overrides.allowSelfPickup ?? true,
    ],
  );

  await sql(
    `insert into public.listing_photos (listing_id, storage_path, sort, alt_text, width, height)
     select $1, $2 || '/' || n || '.webp', n - 1, $3, 1200, 900
       from generate_series(1, 3) n`,
    [listing!.id, `${overrides.sellerId ?? SELLER_ID}/${id}`, title],
  );

  return listing!;
}

export async function getOrder(orderId: string) {
  const [order] = await sql<{
    id: string;
    status: string;
    paid_at: string | null;
    item_agorot: string;
    commission_agorot: string;
    seller_payout_agorot: string;
    total_agorot: string;
    refund_agorot: string;
    listing_id: string;
  }>(`select * from public.orders where id = $1`, [orderId]);
  return order ?? null;
}

export async function getListingStatus(listingId: string) {
  const [row] = await sql<{ status: string }>(
    `select status from public.listings where id = $1`,
    [listingId],
  );
  return row?.status ?? null;
}

export async function getOrderEvents(orderId: string) {
  return sql<{ type: string; payload: Record<string, unknown> }>(
    `select type, payload from public.order_events where order_id = $1 order by created_at`,
    [orderId],
  );
}

export async function latestOrderForListing(listingId: string) {
  const [row] = await sql<{ id: string }>(
    `select id from public.orders where listing_id = $1 order by created_at desc limit 1`,
    [listingId],
  );
  return row?.id ?? null;
}
