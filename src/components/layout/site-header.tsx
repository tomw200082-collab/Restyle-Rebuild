import Link from 'next/link';
import { Search } from 'lucide-react';
import { Container } from './container';
import { Button } from '@/components/ui/button';
import { createPublicSupabase } from '@/lib/supabase/public';
import { tags } from '@/lib/cache/tags';
import { MobileNav } from './mobile-nav';
import { AuthChip } from './auth-chip';

/**
 * Server component, but deliberately cookie-free: it reads only public
 * category data. Session state is resolved in <AuthChip /> on the client so
 * that rendering the header does not opt every page out of ISR.
 */
export async function SiteHeader() {
  const supabase = createPublicSupabase({ tags: [tags.categories] });
  const { data: categories } = await supabase
    .from('categories')
    .select('slug, name_he')
    .order('sort')
    .limit(8);

  const nav = categories ?? [];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/80">
      <Container>
        <div className="flex h-16 items-center gap-4">
          <MobileNav categories={nav} />

          <Link href="/" className="font-display text-h3 tracking-tight text-ink">
            Restyle
          </Link>

          <form action="/catalog" className="hidden flex-1 md:block" role="search">
            <div className="relative mx-auto max-w-md">
              {/* Search is direction-neutral — it must not mirror. */}
              <Search
                aria-hidden
                className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-subtle"
              />
              <input
                type="search"
                name="q"
                placeholder="חיפוש ספה, שולחן, מותג…"
                aria-label="חיפוש בקטלוג"
                className="h-10 w-full rounded-md border border-line-strong bg-surface ps-9 pe-3 text-body-sm text-ink placeholder:text-ink-subtle"
              />
            </div>
          </form>

          <div className="ms-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="md" className="hidden sm:inline-flex">
              <Link href="/sell">מכירת פריט</Link>
            </Button>
            <AuthChip />
          </div>
        </div>

        <nav aria-label="קטגוריות" className="hidden border-t border-line md:block">
          <ul className="flex items-center gap-6 overflow-x-auto py-2.5 text-body-sm">
            <li>
              <Link href="/catalog" className="whitespace-nowrap text-ink transition-colors hover:text-clay">
                כל הפריטים
              </Link>
            </li>
            {nav.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="whitespace-nowrap text-ink-muted transition-colors hover:text-clay"
                >
                  {c.name_he}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </header>
  );
}
