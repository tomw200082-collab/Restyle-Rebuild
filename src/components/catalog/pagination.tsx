import Link from 'next/link';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Chevrons are direction-bearing, so under RTL "previous" points right and
 * "next" points left. The semantically-opposite icon is imported rather than
 * transform-flipped, so the DOM matches what the user sees.
 */
export function Pagination({
  page,
  pageCount,
  buildHref,
}: {
  page: number;
  pageCount: number;
  buildHref: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  const prev = page > 1 ? buildHref(page - 1) : null;
  const next = page < pageCount ? buildHref(page + 1) : null;

  return (
    <nav aria-label="עמודים" className="mt-12 flex items-center justify-center gap-2">
      <PageLink href={prev} label="הקודם">
        <ChevronRight aria-hidden className="size-4" />
      </PageLink>

      <span className="px-4 text-body-sm text-ink-muted tabular">
        עמוד {page} מתוך {pageCount}
      </span>

      <PageLink href={next} label="הבא">
        <ChevronLeft aria-hidden className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    'inline-flex h-10 items-center gap-1 rounded-md border border-line-strong px-3 text-body-sm',
    href ? 'text-ink hover:bg-sand' : 'pointer-events-none text-ink-subtle opacity-50',
  );

  if (!href) {
    return (
      <span className={classes} aria-disabled>
        {children}
        {label}
      </span>
    );
  }

  return (
    <Link href={href} className={classes} rel={label === 'הבא' ? 'next' : 'prev'}>
      {children}
      {label}
    </Link>
  );
}
