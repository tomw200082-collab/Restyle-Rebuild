/**
 * Hebrew formatting for the brief.
 *
 * Money is integer agorot everywhere in this system, and it stays that way
 * until the last moment. `/100` happens here, once, at the point of display —
 * never in a query, never in an intermediate step. [D-01]
 */

const ILS = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

const NUM = new Intl.NumberFormat('he-IL');

export const shekels = (agorot: number | null | undefined): string =>
  ILS.format(Math.round((agorot ?? 0) / 100));

export const count = (n: number | null | undefined): string => NUM.format(n ?? 0);

export const pct = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${NUM.format(value)}%`;

export const days = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${NUM.format(value)} ימים`;

export const hours = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${NUM.format(Math.round(value))} שעות`;

/** he-IL date, for a human reading it over coffee. */
export const hebrewDate = (iso: string): string =>
  new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  );

/**
 * A delta with its direction, and the direction is stated rather than implied
 * by a sign — a reader scanning at 06:30 should not have to work out whether
 * `-3` is good.
 */
export function delta(current: number, previous: number, unit: 'money' | 'count' = 'count'): string {
  const diff = current - previous;
  if (diff === 0) return 'ללא שינוי';
  const rendered = unit === 'money' ? shekels(Math.abs(diff)) : count(Math.abs(diff));
  return diff > 0 ? `▲ ${rendered}` : `▼ ${rendered}`;
}

/** Markdown table row, escaping the one character that would break it. */
export const row = (...cells: Array<string | number>): string =>
  `| ${cells.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`;
