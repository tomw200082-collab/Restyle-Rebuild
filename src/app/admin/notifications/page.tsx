import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { createServiceSupabase } from '@/lib/supabase/service';
import { formatShortDate, formatTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'יומן הודעות' };

/**
 * The email log.
 *
 * The legacy platform accumulated 51 silent delivery failures across three
 * overlapping tables, and nobody knew until the audit — sellers simply never
 * heard that they had a sale, which is the failure the whole business died of.
 * One table, one row per send, and a failure is a row with a reason on it
 * rather than a message nobody knows was lost. [LI 8.5]
 */
const STATUS_TONE = {
  sent: 'success',
  queued: 'warning',
  failed: 'danger',
} as const;

const STATUS_LABEL: Record<string, string> = {
  sent: 'נשלח',
  queued: 'בתור',
  failed: 'נכשל',
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const service = createServiceSupabase();

  let query = service
    .from('outbound_events')
    .select('id, type, recipient, recipient_role, subject, status, error, sent_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (status && status in STATUS_LABEL) query = query.eq('status', status);

  const { data: events, error } = await query;
  if (error) throw error;

  const rows = events ?? [];
  const failedCount = rows.filter((e) => e.status === 'failed').length;

  const FILTERS: Array<{ value: string; label: string }> = [
    { value: '', label: 'הכול' },
    { value: 'failed', label: 'נכשלו' },
    { value: 'queued', label: 'בתור' },
    { value: 'sent', label: 'נשלחו' },
  ];

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1 text-ink">יומן הודעות</h1>
        {failedCount > 0 ? (
          <p className="text-body-sm text-danger tabular">{failedCount} כשלים ב-200 האחרונות</p>
        ) : (
          <p className="text-body-sm text-ink-muted">אין כשלים ב-200 ההודעות האחרונות</p>
        )}
      </div>

      <nav aria-label="סינון לפי סטטוס" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/admin/notifications?status=${filter.value}` : '/admin/notifications'}
            className={
              (status ?? '') === filter.value
                ? 'rounded-sm bg-clay px-3 py-1.5 text-body-sm text-white'
                : 'rounded-sm border border-line bg-surface px-3 py-1.5 text-body-sm text-ink-muted transition-colors hover:bg-sand'
            }
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="אין הודעות ביומן"
          body="כל מייל שהמערכת שולחת נרשם כאן, עם הסיבה אם הוא נכשל."
        />
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((event) => (
            <li
              key={event.id}
              className="rounded-lg border border-line bg-surface p-4 text-body-sm"
              data-testid="notification-row"
              data-status={event.status}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-body text-ink">{event.subject || event.type}</span>
                <Badge tone={STATUS_TONE[event.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
                  {STATUS_LABEL[event.status] ?? event.status}
                </Badge>
              </div>

              <p className="mt-1 text-ink-muted">
                <span className="ltr-isolate">{event.recipient}</span>
                {event.recipient_role ? ` · ${event.recipient_role}` : ''}
                {' · '}
                <span className="tabular">
                  {formatShortDate(event.created_at)} {formatTime(event.created_at)}
                </span>
              </p>

              {event.error ? (
                <p className="mt-2 rounded-md bg-danger-soft p-2 text-danger">{event.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
