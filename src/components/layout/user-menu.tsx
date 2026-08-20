'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export function UserMenu({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-body-sm text-ink hover:bg-sand"
      >
        <span className="max-w-32 truncate">{email.split('@')[0]}</span>
        {/* Vertical chevron: the vertical axis is unaffected by direction. */}
        <ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="menu"
            className="absolute end-0 top-full z-20 mt-1 w-52 rounded-lg border border-line bg-surface p-1 shadow-pop"
          >
            <MenuLink href="/dashboard/buyer" onNavigate={() => setOpen(false)}>הרכישות שלי</MenuLink>
            <MenuLink href="/dashboard/seller" onNavigate={() => setOpen(false)}>המכירות שלי</MenuLink>
            <MenuLink href="/dashboard/buyer?tab=favorites" onNavigate={() => setOpen(false)}>מועדפים</MenuLink>
            {isAdmin ? (
              <MenuLink href="/admin" onNavigate={() => setOpen(false)}>ניהול</MenuLink>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="block w-full rounded-sm px-3 py-2 text-start text-body-sm text-ink-muted hover:bg-sand"
            >
              יציאה
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="block rounded-sm px-3 py-2 text-body-sm text-ink hover:bg-sand"
    >
      {children}
    </Link>
  );
}
