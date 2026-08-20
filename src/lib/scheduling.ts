import type { Enums } from '@/types/database';

export type Shift = Enums<'delivery_shift'>;

export type Slot = { date: string; shift: Shift };

/**
 * Delivery scheduling rules, carried over from the legacy platform because
 * they encode real Israeli-calendar logistics rather than arbitrary limits.
 * [D-32], [LI 3]
 *
 *   - earliest is tomorrow (a crew is dispatched, not summoned)
 *   - never Saturday
 *   - Friday is morning only
 *   - at most 90 days ahead
 *
 * An interface that can offer a Saturday pickup is not slightly wrong — it is
 * an appointment nobody will keep, and the cost lands on a crew that has
 * already been sent.
 */

export const SHIFTS: Shift[] = ['morning', 'afternoon', 'evening'];

export const SHIFT_HOURS: Record<Shift, string> = {
  morning: '09:00–12:00',
  afternoon: '12:00–16:00',
  evening: '16:00–19:00',
};

const MAX_DAYS_AHEAD = 90;

/** Local (Asia/Jerusalem) ISO date, avoiding a UTC day-boundary slip. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isSaturday(date: Date): boolean {
  return date.getDay() === 6;
}

export function isFriday(date: Date): boolean {
  return date.getDay() === 5;
}

export function shiftsForDate(date: Date): Shift[] {
  if (isSaturday(date)) return [];
  if (isFriday(date)) return ['morning'];
  return SHIFTS;
}

export function isSlotAllowed(slot: Slot, now: Date = new Date()): boolean {
  const date = parseDateKey(slot.date);
  if (!date) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() + 1);

  const latest = new Date(today);
  latest.setDate(latest.getDate() + MAX_DAYS_AHEAD);

  if (date < earliest || date > latest) return false;
  return shiftsForDate(date).includes(slot.shift);
}

/** The selectable dates a picker should offer. */
export function availableDates(now: Date = new Date(), days = 21): Array<{ date: string; shifts: Shift[] }> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: Array<{ date: string; shifts: Shift[] }> = [];

  for (let offset = 1; offset <= days; offset += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    const shifts = shiftsForDate(date);
    if (shifts.length) out.push({ date: toDateKey(date), shifts });
  }

  return out;
}

/**
 * A seller proposes 2–3 windows and the platform picks one, because only the
 * platform knows crew capacity. [D-14]
 */
export function validateProposedWindows(
  slots: Slot[],
  now: Date = new Date(),
): { ok: true } | { ok: false; error: string } {
  if (slots.length < 2) return { ok: false, error: 'בחרו לפחות שני מועדים אפשריים' };
  if (slots.length > 3) return { ok: false, error: 'אפשר להציע עד שלושה מועדים' };

  const seen = new Set<string>();
  for (const slot of slots) {
    const key = `${slot.date}|${slot.shift}`;
    if (seen.has(key)) return { ok: false, error: 'אי אפשר להציע את אותו מועד פעמיים' };
    seen.add(key);

    if (!isSlotAllowed(slot, now)) {
      return { ok: false, error: 'אחד המועדים שנבחרו אינו זמין. שימו לב: אין איסוף בשבת, ובשישי רק בבוקר.' };
    }
  }

  return { ok: true };
}
