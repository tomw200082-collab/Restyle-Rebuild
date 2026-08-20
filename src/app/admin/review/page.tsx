import { Container } from '@/components/layout/container';
import { EmptyState } from '@/components/ui/empty-state';
import { ReviewCard } from '@/components/admin/review-card';
import { createServiceSupabase } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'אישור פריטים' };

export default async function ReviewQueuePage() {
  const service = createServiceSupabase();
  const { data: listings, error } = await service
    .from('listings')
    .select(
      `id, slug, title, description, price_agorot, original_price_agorot, condition,
       width_cm, depth_cm, height_cm, pickup_city, pickup_floor, pickup_has_elevator,
       needs_disassembly, created_at,
       categories ( name_he ), brands ( name ),
       profiles!listings_seller_profile_fk ( full_name, email, phone ),
       listing_photos ( id, storage_path, alt_text, sort )`,
    )
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const queue = listings ?? [];

  return (
    <Container className="py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-h1 text-ink">אישור פריטים</h1>
        <p className="text-body-sm text-ink-muted tabular" data-testid="review-count">
          {queue.length} ממתינים
        </p>
      </div>

      {queue.length === 0 ? (
        <EmptyState
          title="אין פריטים שממתינים לאישור"
          body="כשמוכר ישלח פריט חדש, הוא יופיע כאן."
        />
      ) : (
        <ul className="mt-8 space-y-6">
          {queue.map((listing) => (
            <ReviewCard key={listing.id} listing={listing} />
          ))}
        </ul>
      )}
    </Container>
  );
}
