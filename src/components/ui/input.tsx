import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

/**
 * `dir` is deliberately a prop rather than inherited: email, URL, phone and
 * numeric fields must render LTR even inside an RTL page, or the @ and leading
 * zeros land visually in the wrong place. See the hebrew-rtl-ui skill.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-11 w-full rounded-md border bg-surface px-3 text-body text-ink',
        'placeholder:text-ink-subtle transition-colors',
        'disabled:cursor-not-allowed disabled:bg-sand disabled:text-ink-subtle',
        invalid ? 'border-danger' : 'border-line-strong',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      'w-full rounded-md border bg-surface px-3 py-2 text-body text-ink',
      'placeholder:text-ink-subtle transition-colors min-h-28',
      invalid ? 'border-danger' : 'border-line-strong',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-11 w-full rounded-md border border-line-strong bg-surface px-3',
      'text-body text-ink transition-colors',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

/**
 * Optional fields are marked, not required ones: in a form where most fields
 * are required, marking the minority is what actually reads.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-caption font-medium text-ink-muted">
        {label}
        {optional ? <span className="text-ink-subtle"> (אופציונלי)</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-body-sm text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
