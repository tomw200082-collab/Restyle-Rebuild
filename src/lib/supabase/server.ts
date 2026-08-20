import 'server-only';

import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';

/**
 * Request-scoped client carrying the caller's session, so every query runs
 * under their RLS policies.
 *
 * `cache()` gives one instance per request rather than one per helper that
 * asks for a client: the cookie jar is parsed once, and the auth client's
 * in-memory session is shared instead of being rebuilt for every query.
 */
export const createServerSupabase = cache(async () => {
  const cookieStore = await cookies();

  const client = createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The middleware refreshes the
          // session on every request, so this is safe to swallow here.
        }
      },
    },
  });

  return client;
});
