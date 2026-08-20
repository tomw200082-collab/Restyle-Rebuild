import 'server-only';

import { headers } from 'next/headers';
import { createServiceSupabase } from '@/lib/supabase/service';

/**
 * Rate limits, counted in Postgres.
 *
 * Not in memory: this runs as serverless functions, so a per-process counter
 * is per-instance and resets on every cold start. It would look like a rate
 * limit in code review and limit almost nothing in production.
 *
 * Every limit is deliberately generous for a real person and tight enough to
 * make automation expensive. The point is not to stop a determined attacker —
 * it is to keep one script from emptying the AI budget or filling a seller's
 * inbox with offers.
 */
export type RateLimitRule = {
  /** Namespace, so two features cannot share a counter. */
  bucket: string;
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  /** A metered upstream call. A seller drafting honestly uses a handful a day. */
  aiDraft: { bucket: 'ai_draft', limit: 20, windowSeconds: 3600 },
  /** Offer spam is the cheapest way to harass a seller. */
  offer: { bucket: 'offer', limit: 10, windowSeconds: 3600 },
  /** A dispute is a human process on our side; volume here is never legitimate. */
  dispute: { bucket: 'dispute', limit: 5, windowSeconds: 86_400 },
  /** Listing submission enters a human review queue. */
  listingSubmit: { bucket: 'listing_submit', limit: 20, windowSeconds: 86_400 },
  /** Checkout creates orders and reserves stock. */
  checkout: { bucket: 'checkout', limit: 30, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetsAt: Date | null;
};

/**
 * Consumes one unit against `subject` (normally a user id).
 *
 * Fails **open** on an infrastructure error. A rate limiter that takes the
 * checkout down when the database hiccups has caused more damage than the abuse
 * it was protecting against; the failure is logged so it is not silent.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await createServiceSupabase().rpc('consume_rate_limit', {
      p_bucket: rule.bucket,
      p_subject: subject,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('consume_rate_limit returned no row');

    return {
      allowed: row.allowed,
      remaining: row.remaining,
      resetsAt: row.resets_at ? new Date(row.resets_at) : null,
    };
  } catch (err) {
    console.error(`rate limit ${rule.bucket} failed open:`, err instanceof Error ? err.message : err);
    return { allowed: true, remaining: rule.limit, resetsAt: null };
  }
}

/**
 * The client address, for limiting things a signed-out visitor can do.
 *
 * `x-forwarded-for` is client-controlled and only trustworthy because Vercel
 * overwrites it at the edge — never treat it as identity, only as a bucket key,
 * and always prefer a user id where one exists.
 */
export async function clientAddress(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || headerList.get('x-real-ip') || 'unknown';
}

/** The Hebrew a user sees when they hit a limit. Never mentions the number. */
export const RATE_LIMITED_MESSAGE = 'יותר מדי בקשות בזמן קצר. נסו שוב בעוד כמה דקות.';
