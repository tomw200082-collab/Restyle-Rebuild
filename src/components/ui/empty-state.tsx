import type { ReactNode } from 'react';

/**
 * Never just "אין תוצאות": a heading saying what is missing, one sentence on
 * what to do about it, and a control that does it.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h3 className="text-h3 text-ink">{title}</h3>
      {body ? <p className="mt-2 max-w-md text-body text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
