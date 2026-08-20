/**
 * What the target database actually contains.
 *
 * Several stages are only meaningful with data — a Product block needs an item,
 * a sold-page check needs a sold item, a Lighthouse item-page budget needs an
 * item page. Asking once, here, keeps the "why did this skip" answer identical
 * across all of them instead of each stage inventing its own phrasing.
 */
let cached: { activeListings: number; soldListings: number } | null = null;

export async function targetCounts(): Promise<{ activeListings: number; soldListings: number }> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return (cached = { activeListings: 0, soldListings: 0 });

  const count = async (status: string): Promise<number> => {
    const response = await fetch(
      `${url.replace(/\/$/, '')}/rest/v1/listings?select=id&status=eq.${status}&limit=1`,
      { headers: { apikey: key, authorization: `Bearer ${key}`, prefer: 'count=exact' } },
    );
    if (!response.ok) return 0;
    // PostgREST reports the total in Content-Range as `0-0/N`.
    const range = response.headers.get('content-range') ?? '';
    return Number(range.split('/')[1] ?? 0);
  };

  cached = { activeListings: await count('active'), soldListings: await count('sold') };
  return cached;
}
