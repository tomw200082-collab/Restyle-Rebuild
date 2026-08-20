import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { matchLegacyRoute } from '@/lib/seo/legacy-routes';

/**
 * Resolves a legacy record id to its v2 path via the `legacy_redirects` table.
 *
 * Uses a plain fetch against PostgREST rather than a Supabase client: the
 * middleware runs on the edge runtime for every request, and this path is only
 * reached when a URL already looks legacy, so keeping it dependency-free keeps
 * the common case free too.
 */
async function resolveLegacyId(legacyId: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const response = await fetch(
      `${url}/rest/v1/legacy_redirects?legacy_id=eq.${encodeURIComponent(legacyId)}&select=new_path&limit=1`,
      {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        // The map is immutable once imported, so it is worth caching hard.
        next: { revalidate: 3600 },
      },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ new_path: string }>;
    return rows[0]?.new_path ?? null;
  } catch {
    // A redirect lookup must never take the site down. Falling through sends
    // the visitor to the catalogue, which is a worse outcome than the right
    // item and a much better one than an error page.
    return null;
  }
}

/**
 * Refreshes the Supabase session on every request so Server Components always
 * see a valid token, and 301s legacy URLs onto their v2 equivalents.
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const legacy = matchLegacyRoute(pathname, searchParams);
  if (legacy) {
    let target = legacy.kind === 'static' ? legacy.target : legacy.fallback;

    if (legacy.kind === 'lookup') {
      target = (await resolveLegacyId(legacy.legacyId)) ?? legacy.fallback;
    }

    // `/catalog` and `/admin` are both legacy names and current ones. Only the
    // differently-cased variants are worth a redirect; redirecting a path to
    // itself is an infinite loop.
    if (target !== pathname) {
      // 301: these URLs are gone for good, and the whole point is to move the
      // accumulated authority onto the new path.
      return NextResponse.redirect(new URL(target, request.url), 301);
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml)$).*)',
  ],
};
