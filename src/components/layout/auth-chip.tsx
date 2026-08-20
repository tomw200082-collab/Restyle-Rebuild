'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { UserMenu } from './user-menu';

/**
 * Session state is resolved in the browser rather than on the server, so the
 * header — and therefore every page that renders it — stays statically
 * cacheable. A server-rendered session chip would opt the whole site out of
 * ISR, which is the one thing the SEO strategy cannot afford.
 */
export function AuthChip() {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'anon' } | { status: 'user'; email: string; isAdmin: boolean }
  >({ status: 'loading' });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function resolve(userId: string | undefined, email: string | undefined) {
      if (!userId) {
        if (!cancelled) setState({ status: 'anon' });
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (!cancelled) {
        setState({ status: 'user', email: email ?? '', isAdmin: profile?.role === 'admin' });
      }
    }

    supabase.auth.getUser().then(({ data }) => resolve(data.user?.id, data.user?.email));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      resolve(session?.user.id, session?.user.email);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (state.status === 'loading') {
    // Reserve the same width so the header does not shift when it resolves.
    return <div className="h-10 w-24" aria-hidden />;
  }

  if (state.status === 'anon') {
    return (
      <Button asChild variant="primary" size="md">
        <Link href="/login">כניסה</Link>
      </Button>
    );
  }

  return <UserMenu email={state.email} isAdmin={state.isAdmin} />;
}
