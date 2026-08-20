import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';

/**
 * Service-role client. **Bypasses RLS entirely.**
 *
 * Every call site must perform its own authorization check first — RLS is the
 * backstop, not the only check. [D-28]
 *
 * Legitimate uses are narrow and auditable:
 *   - seeds and migrations
 *   - cron routes (guarded by CRON_SECRET)
 *   - admin actions, after `requireAdmin()`
 *   - the guarded state-machine RPCs, which are service_role-only [D-44]
 *   - reading `listings.pickup_street`, the one column no API role can see [D-45]
 */
export function createServiceSupabase() {
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
