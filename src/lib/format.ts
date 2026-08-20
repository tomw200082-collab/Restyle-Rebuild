/**
 * he-IL formatting. The ONLY place currency, dates, times and numbers are
 * turned into strings. See the hebrew-rtl-ui skill.
 *
 * Money lives in the codebase as integer agorot and is divided by 100 exactly
 * here, at the display boundary, and nowhere else.
 */

const HE = 'he-IL';

const priceFormatter = new Intl.NumberFormat(HE, {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat(HE);

const longDateFormatter = new Intl.DateTimeFormat(HE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat(HE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(HE, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Agorot → "₪1,100". Israeli furniture prices are whole shekels. */
export function formatPrice(agorot: number): string {
  return priceFormatter.format(agorot / 100);
}

/** Agorot → "1,100" without the currency symbol, for inputs and tables. */
export function formatAmount(agorot: number): string {
  return numberFormatter.format(agorot / 100);
}

export function formatNumber(n: number): string {
  return numberFormatter.format(n);
}

/** "20 באוגוסט 2026" */
export function formatDate(d: Date | string): string {
  return longDateFormatter.format(new Date(d));
}

/** "20.08.2026" — Israeli dates are day-first, never ISO in user-facing text. */
export function formatShortDate(d: Date | string): string {
  return shortDateFormatter.format(new Date(d));
}

/** "14:30" — 24-hour, always. */
export function formatTime(d: Date | string): string {
  return timeFormatter.format(new Date(d));
}

export function formatDateTime(d: Date | string): string {
  return `${formatShortDate(d)} ${formatTime(d)}`;
}

/**
 * Shekels typed by a human → agorot. Tolerates "1,100", "₪1100", " 1100 ".
 * Returns null for anything that isn't a non-negative number, so callers must
 * handle the failure rather than silently receiving NaN.
 */
export function parseShekelsToAgorot(input: string): number | null {
  const cleaned = input.replace(/[₪,\s]/g, '');
  if (cleaned === '' || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/**
 * "180 × 90 × 75 ס״מ". The × is bidi-neutral, so the numeric run is
 * direction-isolated by the caller via the `.ltr-isolate` utility — otherwise
 * it can visually reorder to "75 × 90 × 180".
 */
export function formatDimensions(w: number, d: number, h: number): string {
  return `${w} × ${d} × ${h}`;
}

/** Public identity: first name + last initial. Never a full name. [D-06] */
export function publicName(fullName: string | null | undefined): string {
  if (!fullName) return 'משתמש';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return 'משתמש';
  const last = parts[1];
  return last ? `${first} ${last.charAt(0)}׳` : first;
}

/** Hours remaining until a deadline, floored at 0. */
export function hoursUntil(deadline: Date | string, now: Date = new Date()): number {
  const ms = new Date(deadline).getTime() - now.getTime();
  return Math.max(0, Math.floor(ms / 3_600_000));
}
