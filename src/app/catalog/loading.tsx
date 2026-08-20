/*
 * A route-level `loading.tsx` opens a Suspense boundary around the whole page,
 * which makes Next start streaming — and once streaming starts the status is
 * committed to 200, so a later `notFound()` can only inject a noindex meta tag.
 * That is a soft 404: it looks right and reports success.
 *
 * This route never calls notFound(); it renders an empty state instead. The
 * routes that resolve a slug (item, category, city, brand) deliberately have no
 * loading.tsx for that reason — they are prerendered anyway, so the only
 * request that would see a skeleton is an unknown slug, which is exactly the
 * request that needs a real 404.
 */
import { Container } from '@/components/layout/container';
import { ListingGridSkeleton, Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <Container className="py-10">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="mt-8 h-12 w-full" />
      <ListingGridSkeleton count={12} />
    </Container>
  );
}
