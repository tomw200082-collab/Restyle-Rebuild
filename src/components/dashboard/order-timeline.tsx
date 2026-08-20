import { formatDateTime } from '@/lib/format';

/**
 * Rendered from `order_events`, the append-only audit. Both parties see the
 * same history, which is what makes a disputed order arguable from facts
 * rather than from memory. [D-05]
 */
const EVENT_LABELS: Record<string, string> = {
  order_created: 'ההזמנה נוצרה',
  payment_captured: 'התשלום התקבל',
  payment_not_completed: 'התשלום לא הושלם',
  payment_amount_mismatch: 'אי־התאמה בסכום התשלום',
  seller_confirmed: 'המוכר אישר את המכירה',
  seller_confirmation_timeout: 'ההזמנה בוטלה — המוכר לא אישר בזמן',
  checkout_abandoned: 'ההזמנה בוטלה — התשלום לא הושלם',
  cancelled_by_buyer: 'הקונה ביטל את ההזמנה',
  refund_issued: 'הוחזר תשלום',
  refund_failed: 'ההחזר נכשל — הצוות שלנו מטפל',
  delivery_scheduled: 'ההובלה נקבעה',
  picked_up: 'הפריט נאסף מהמוכר',
  delivered: 'הפריט נמסר',
  protection_window_elapsed: 'חלון הבדיקה עבר — העסקה הושלמה',
  payout_queued: 'התשלום למוכר נכנס לתור',
  payout_paid: 'התשלום למוכר בוצע',
  dispute_opened: 'נפתחה בקשת בירור',
  dispute_resolved: 'בקשת הבירור טופלה',
  status_change: 'עדכון סטטוס',
  noop: 'בדיקה תקופתית',
};

export function OrderTimeline({
  events,
}: {
  events: Array<{ id: string; type: string; created_at: string }>;
}) {
  // No-op audit rows exist so a repeated cron run leaves a trace, but they are
  // machine bookkeeping and would only add noise for a human.
  const visible = events.filter((e) => e.type !== 'noop');
  if (visible.length === 0) return null;

  return (
    <section>
      <h2 className="text-h3 text-ink">מה קרה עד עכשיו</h2>
      <ol className="mt-4 space-y-3" data-testid="order-timeline">
        {visible.map((event) => (
          <li key={event.id} className="flex gap-3 text-body-sm">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-clay" aria-hidden />
            <span className="text-ink">{EVENT_LABELS[event.type] ?? event.type}</span>
            <span className="ms-auto whitespace-nowrap text-ink-subtle">
              {formatDateTime(event.created_at)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
