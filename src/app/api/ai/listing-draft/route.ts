import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAiListingProvider } from '@/lib/ai';
import { getUserOrNull } from '@/lib/auth/session';
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  }

  const supabase = createPublicSupabase({ tags: [tags.categories, tags.brands] });
  const [{ data: categories }, { data: brands }] = await Promise.all([
    supabase.from('categories').select('slug, name_he').order('sort'),
    supabase.from('brands').select('name').order('sort'),
  ]);

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
