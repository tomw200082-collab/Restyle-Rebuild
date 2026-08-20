'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { getUserOrNull } from '@/lib/auth/session';

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Server actions re-check authorization before touching the database. RLS is
 * the backstop, not the only check. [D-28]
 */
export async function toggleFavorite(listingId: string): Promise<ActionResult> {
  const user = await getUserOrNull();
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לשמור פריטים' };

  const supabase = await createServerSupabase();

  const { data: existing, error: existingError } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', user.id)
    .eq('listing_id', listingId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('listing_id', listingId);
    if (error) return { ok: false, error: 'לא הצלחנו להסיר מהמועדפים' };
  } else {
    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: user.id, listing_id: listingId });
    if (error) return { ok: false, error: 'לא הצלחנו להוסיף למועדפים' };
  }

  revalidatePath('/dashboard/buyer');
  return { ok: true };
}

export async function isFavorited(listingId: string): Promise<boolean> {
  const user = await getUserOrNull();
  if (!user) return false;

  const supabase = await createServerSupabase();
  const { data, error: dataError } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', user.id)
    .eq('listing_id', listingId)
    .maybeSingle();
  if (dataError) throw dataError;

  return Boolean(data);
}
