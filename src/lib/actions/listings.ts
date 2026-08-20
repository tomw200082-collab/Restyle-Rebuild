'use server';

import { createServerSupabase } from '@/lib/supabase/server';
import { createServiceSupabase } from '@/lib/supabase/service';
import { getUserOrNull } from '@/lib/auth/session';
import { buildSlug } from '@/lib/seo/slug';
import { listingDraftSchema, fieldErrors } from '@/lib/validation/listing';
import { invalidateFromAction } from '@/lib/cache/invalidate';

export type SubmitResult =
  | { ok: true; listingId: string; slug: string }
  | { ok: false; error: string; fields?: Record<string, string> };

/**
 * Creates a listing in `pending_review`. Curation is not optional: RLS also
 * forbids inserting straight into `active`, so this is enforced twice. [MP 3.2]
 */
export async function submitListing(raw: unknown): Promise<SubmitResult> {
  const user = await getUserOrNull();
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לפרסם פריט' };

  const parsed = listingDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'יש שדות שצריך לתקן', fields: fieldErrors(parsed.error) };
  }
  const input = parsed.data;

  const supabase = await createServerSupabase();

  const [{ data: category }, { data: brand }] = await Promise.all([
    supabase.from('categories').select('id').eq('slug', input.category_slug).maybeSingle(),
    input.brand_slug
      ? supabase.from('brands').select('id').eq('slug', input.brand_slug).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!category) return { ok: false, error: 'הקטגוריה שנבחרה אינה קיימת' };

  // The id is generated here so the slug can be derived from it in the same
  // insert — the slug is the SEO asset and must be stable from the start. [D-24]
  const listingId = crypto.randomUUID();
  const slug = buildSlug(input.title, listingId);

  const { error: insertError } = await supabase.from('listings').insert({
    id: listingId,
    slug,
    seller_id: user.id,
    title: input.title,
    description: input.description,
    category_id: category.id,
    brand_id: brand?.id ?? null,
    brand_free_text: input.brand_free_text || null,
    condition: input.condition,
    width_cm: input.width_cm,
    depth_cm: input.depth_cm,
    height_cm: input.height_cm,
    price_agorot: input.price_agorot,
    original_price_agorot: input.original_price_agorot ?? null,
    status: 'pending_review',
    pickup_city: input.pickup_city,
    pickup_street: input.pickup_street,
    pickup_floor: input.pickup_floor,
    pickup_has_elevator: input.pickup_has_elevator,
    needs_disassembly: input.needs_disassembly,
    allow_self_pickup: input.allow_self_pickup,
    notes: input.notes || null,
  });

  if (insertError) {
    return { ok: false, error: 'לא הצלחנו לשמור את הפריט. נסו שוב.' };
  }

  const { error: photoError } = await supabase.from('listing_photos').insert(
    input.photos.map((p, index) => ({
      listing_id: listingId,
      storage_path: p.storage_path,
      sort: index,
      alt_text: p.alt_text ?? input.title,
      width: p.width ?? null,
      height: p.height ?? null,
    })),
  );

  if (photoError) {
    // A listing with no photos is unreviewable, so roll it back rather than
    // leaving a broken row in the admin queue.
    await createServiceSupabase().from('listings').delete().eq('id', listingId);
    return { ok: false, error: 'לא הצלחנו לשמור את התמונות. נסו שוב.' };
  }

  invalidateFromAction('listing_updated', { listingId });

  return { ok: true, listingId, slug };
}
