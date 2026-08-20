import { cn } from '@/lib/utils';

/**
 * `sand` rather than the usual grey, and no shimmer animation.
 *
 * A skeleton is a promise about layout: it must match the real content's
 * inline direction and width, or the page visibly jumps when it resolves —
 * which is worse than a slightly longer blank.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-sand', className)} aria-hidden />;
}

/** Mirrors ListingCard: 4/3 image, two-line title, price, one metadata row. */
export function ListingCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-4/3 w-full rounded-lg" />
      <Skeleton className="mt-3 h-5 w-4/5" />
      <Skeleton className="mt-2 h-6 w-1/3" />
      <Skeleton className="mt-2 h-4 w-2/3" />
    </div>
  );
}

export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4"
      role="status"
      aria-label="טוען פריטים"
    >
      {Array.from({ length: count }, (_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}
