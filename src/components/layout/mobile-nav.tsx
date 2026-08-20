'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Category = { slug: string; name_he: string };

export function MobileNav({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<{ authed: boolean; isAdmin: boolean }>({
    authed: false,
    isAdmin: false,
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();
      if (!cancelled) setSession({ authed: true, isAdmin: profile?.role === 'admin' });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const { authed: isAuthed, isAdmin } = session;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="פתיחת תפריט"
        aria-expanded={open}
        className="-ms-2 inline-flex size-10 items-center justify-center rounded-md text-ink md:hidden"
      >
        {/* Hamburger and X are direction-neutral; they must not mirror. */}
        <Menu aria-hidden className="size-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 start-0 w-[82%] max-w-sm overflow-y-auto bg-canvas p-6 shadow-pop">
            <div className="flex items-center justify-between">
              <span className="font-display text-h3 text-ink">Restyle</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="סגירת תפריט"
                className="inline-flex size-10 items-center justify-center rounded-md text-ink"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>

            <nav className="mt-8 space-y-6" aria-label="תפריט ראשי">
              <ul className="space-y-3 text-body-lg">
                <li>
                  <Link href="/catalog" onClick={() => setOpen(false)} className="text-ink">
                    כל הפריטים
                  </Link>
                </li>
                {categories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/category/${c.slug}`}
                      onClick={() => setOpen(false)}
                      className="text-ink-muted"
                    >
                      {c.name_he}
                    </Link>
                  </li>
                ))}
              </ul>

              <ul className="space-y-3 border-t border-line pt-6 text-body">
                <li>
                  <Link href="/sell" onClick={() => setOpen(false)} className="text-ink">
                    מכירת פריט
                  </Link>
                </li>
                <li>
                  <Link href="/how-it-works" onClick={() => setOpen(false)} className="text-ink-muted">
                    איך זה עובד
                  </Link>
                </li>
                {isAuthed ? (
                  <>
                    <li>
                      <Link href="/dashboard/buyer" onClick={() => setOpen(false)} className="text-ink-muted">
                        הרכישות שלי
                      </Link>
                    </li>
                    <li>
                      <Link href="/dashboard/seller" onClick={() => setOpen(false)} className="text-ink-muted">
                        המכירות שלי
                      </Link>
                    </li>
                    {isAdmin ? (
                      <li>
                        <Link href="/admin" onClick={() => setOpen(false)} className="text-clay">
                          ניהול
                        </Link>
                      </li>
                    ) : null}
                  </>
                ) : (
                  <li>
                    <Link href="/login" onClick={() => setOpen(false)} className="text-clay">
                      כניסה
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
