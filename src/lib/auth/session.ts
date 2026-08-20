import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Tables } from '@/types/database';

export type Profile = Tables<'profiles'>;

export type SessionUser = {
  id: string;
  email: string;
  profile: Profile | null;
  isAdmin: boolean;
};

/**
 * The current user, or null. `cache()` dedupes this across a single render, so
 * a layout and three components asking for the user cost one round trip.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabase();

  // getUser() validates the token with the auth server. getSession() only
  // decodes the cookie, which a client can forge — never authorize from it.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  return {
    id: user.id,
    email: user.email ?? '',
    profile: profile ?? null,
    isAdmin: profile?.role === 'admin',
  };
});

/** For pages: redirects to login, preserving where the user was heading. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/login${next}`);
  }
  return user;
}

export async function requireAdmin(returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!user.isAdmin) redirect('/');
  return user;
}

/**
 * For server actions and route handlers, where a redirect is the wrong shape.
 * Returns null instead of navigating, so the caller can answer with an error.
 */
export async function getUserOrNull(): Promise<SessionUser | null> {
  return getCurrentUser();
}
