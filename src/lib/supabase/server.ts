import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';

/**
 * Request-scoped client carrying the caller's session, so every query runs
 * under their RLS policies. This is the default for reads.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
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
}
