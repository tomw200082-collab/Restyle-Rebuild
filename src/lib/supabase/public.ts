import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';

/**
 * Cookie-free anonymous client for public catalogue reads.
 *
 * Two things here are load-bearing for the SEO strategy, and both are easy to
 * lose by accident:
 *
 * 1. **No cookies.** Any component that reads cookies opts its whole route
 *    into dynamic rendering, which would make `/`, `/catalog`, `/item/[slug]`,
 *    `/category/*` and `/brand/*` uncacheable.
 * 2. **Tagged fetch.** supabase-js calls `fetch` internally, and Next's fetch
 *    defaults to `no-store` — which ALSO opts the route out of static
 *    generation. Passing explicit `next: { revalidate, tags }` is what makes
 *    these pages ISR, and it is what on-demand `revalidateTag` then hooks into.
 *
 * Reads run as `anon`, so RLS returns exactly what an anonymous visitor may
 * see — precisely the right visibility for a cacheable public page.
 *
 * Anything personalised (dashboards, checkout, admin) must use
 * `createServerSupabase()` so it runs under the caller's own policies.
 */
export function createPublicSupabase(options: { tags?: string[]; revalidate?: number } = {}) {
  const { tags = [], revalidate = 3600 } = options;

  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input as RequestInfo, {
          ...init,
          next: { revalidate, tags },
        } as RequestInit),
    },
  });
}
