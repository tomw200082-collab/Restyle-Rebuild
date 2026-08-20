import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAiListingProvider } from '@/lib/ai';
import { getUserOrNull } from '@/lib/auth/session';
import { RATE_LIMITED_MESSAGE, RATE_LIMITS, consumeRateLimit } from '@/lib/rate-limit';
import { createPublicSupabase } from '@/lib/supabase/public';
import { tags } from '@/lib/cache/tags';

const bodySchema = z.object({
  photoUrls: z.array(z.string()).min(1).max(10),
});

/**
 * Drafts a listing from uploaded photos. Authenticated only: this is a
 * metered upstream call, and an open endpoint is a bill somebody else pays.
 */
export async function POST(request: NextRequest) {
  const user = await getUserOrNull();
  if (!user) {
    return NextResponse.json({ error: 'צריך להתחבר' }, { status: 401 });
  }

  // Authentication alone is not a budget: one signed-in account can still
  // drain a metered upstream. Limited per user, before the body is even read.
  const limit = await consumeRateLimit(RATE_LIMITS.aiDraft, user.id);
  if (!limit.allowed) {
    return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const supabase = createPublicSupabase({ tags: [tags.categories, tags.brands] });
  const [{ data: categories, error: categoriesError }, { data: brands, error: brandsError }] =
    await Promise.all([
      supabase.from('categories').select('slug, name_he').order('sort'),
      supabase.from('brands').select('name').order('sort'),
    ]);
  if (categoriesError) throw categoriesError;
  if (brandsError) throw brandsError;

  try {
    const draft = await getAiListingProvider().draftFromPhotos({
      photoUrls: parsed.data.photoUrls,
      categorySlugs: categories ?? [],
      brandNames: (brands ?? []).map((b) => b.name),
    });
    return NextResponse.json({ draft });
  } catch {
    // A failed draft must not block the seller — the wizard falls back to an
    // empty form, which is exactly what it would have been without AI.
    return NextResponse.json({ error: 'לא הצלחנו להכין טיוטה מהתמונות' }, { status: 502 });
  }
}
