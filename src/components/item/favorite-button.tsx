'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toggleFavorite } from '@/lib/actions/favorites';
import { cn } from '@/lib/utils';

/**
 * Resolves its own state in the browser so the item page stays statically
 * cacheable — a server-rendered favourite state would make every item page
 * dynamic and cost the ISR the SEO plan depends on. [D-46]
 *
 * The heart is direction-neutral and must not mirror.
 */
export function FavoriteButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        if (!cancelled) setAuthed(false);
        return;
      }
      const { data: row } = await supabase
        .from('favorites')
        .select('listing_id')
        .eq('user_id', data.user.id)
        .eq('listing_id', listingId)
        .maybeSingle();
      if (!cancelled) {
        setAuthed(true);
        setFavorited(Boolean(row));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [listingId]);

  function onClick() {
    if (authed === false) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    // Optimistic: the button is a toggle, and a failure simply flips it back.
    setFavorited((v) => !v);
    startTransition(async () => {
      const result = await toggleFavorite(listingId);
      if (!result.ok) setFavorited((v) => !v);
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      onClick={onClick}
      disabled={pending}
      aria-pressed={favorited}
      data-testid="favorite-button"
      className="w-full sm:w-auto"
    >
      <Heart aria-hidden className={cn('size-4', favorited && 'fill-clay text-clay')} />
      {favorited ? 'במועדפים' : 'הוספה למועדפים'}
    </Button>
  );
}
