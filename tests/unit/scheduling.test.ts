import { describe, expect, it } from 'vitest';
import {
  availableDates,
  isSlotAllowed,
  shiftsForDate,
  toDateKey,
  validateProposedWindows,
} from '@/lib/scheduling';

// Sunday 2026-08-16 as the fixed "now" for every case.
const NOW = new Date(2026, 7, 16, 10, 0, 0);
const day = (offset: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  return toDateKey(d);
};

describe('shiftsForDate', () => {
  it('offers no shift on Saturday', () => {
    expect(shiftsForDate(new Date(2026, 7, 22))).toEqual([]); // Saturday
  });

  it('offers mornings only on Friday', () => {
    expect(shiftsForDate(new Date(2026, 7, 21))).toEqual(['morning']); // Friday
  });

  it('offers all three shifts on a normal weekday', () => {
    expect(shiftsForDate(new Date(2026, 7, 19))).toEqual(['morning', 'afternoon', 'evening']);
  });
});

describe('isSlotAllowed', () => {
  it('rejects today — a crew is dispatched, not summoned', () => {
    expect(isSlotAllowed({ date: day(0), shift: 'morning' }, NOW)).toBe(false);
  });

  it('rejects the past', () => {
    expect(isSlotAllowed({ date: day(-1), shift: 'morning' }, NOW)).toBe(false);
  });

  it('accepts tomorrow', () => {
    expect(isSlotAllowed({ date: day(1), shift: 'morning' }, NOW)).toBe(true);
  });

  it('rejects Saturday outright', () => {
    expect(isSlotAllowed({ date: '2026-08-22', shift: 'morning' }, NOW)).toBe(false);
  });

  it('rejects a Friday afternoon but accepts a Friday morning', () => {
    expect(isSlotAllowed({ date: '2026-08-21', shift: 'afternoon' }, NOW)).toBe(false);
    expect(isSlotAllowed({ date: '2026-08-21', shift: 'morning' }, NOW)).toBe(true);
  });

  it('rejects beyond 90 days', () => {
    expect(isSlotAllowed({ date: day(91), shift: 'morning' }, NOW)).toBe(false);
  });

  it('rejects a malformed date rather than coercing it', () => {
    expect(isSlotAllowed({ date: 'not-a-date', shift: 'morning' }, NOW)).toBe(false);
  });
});

describe('availableDates', () => {
  it('never offers a Saturday', () => {
    const dates = availableDates(NOW, 30);
    for (const entry of dates) {
      const d = new Date(`${entry.date}T00:00:00`);
      expect(d.getDay()).not.toBe(6);
    }
  });

  it('offers only a morning on each Friday', () => {
    for (const entry of availableDates(NOW, 30)) {
      const d = new Date(`${entry.date}T00:00:00`);
      if (d.getDay() === 5) expect(entry.shifts).toEqual(['morning']);
    }
  });

  it('starts tomorrow', () => {
    expect(availableDates(NOW, 7)[0]?.date).toBe(day(1));
  });
});

describe('validateProposedWindows', () => {
  it('requires at least two options', () => {
    const result = validateProposedWindows([{ date: day(1), shift: 'morning' }], NOW);
    expect(result.ok).toBe(false);
  });

  it('allows at most three', () => {
    const slots = [1, 2, 3, 4].map((n) => ({ date: day(n), shift: 'morning' as const }));
    expect(validateProposedWindows(slots, NOW).ok).toBe(false);
  });

  it('rejects duplicates', () => {
    const slot = { date: day(1), shift: 'morning' as const };
    expect(validateProposedWindows([slot, { ...slot }], NOW).ok).toBe(false);
  });

  it('rejects a set containing an unavailable slot, explaining the calendar rule', () => {
    const result = validateProposedWindows(
      [{ date: day(1), shift: 'morning' }, { date: '2026-08-22', shift: 'morning' }],
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('שבת');
  });

  it('accepts two valid weekday slots', () => {
    expect(
      validateProposedWindows(
        [{ date: day(1), shift: 'morning' }, { date: day(2), shift: 'evening' }],
        NOW,
      ).ok,
    ).toBe(true);
  });
});
