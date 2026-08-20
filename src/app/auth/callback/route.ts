import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * OAuth and magic-link landing. Exchanges the code for a session, then sends
 * the user where they were originally heading.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/';

  // Only same-origin relative paths: an attacker-supplied `next` would
  // otherwise turn the callback into an open redirect.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
