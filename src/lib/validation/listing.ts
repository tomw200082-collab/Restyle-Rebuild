import { z } from 'zod';

/**
 * Shared client + server validation. Messages are authored in Hebrew here so
 * both sides produce identical text — a server error that reads differently
 * from the client one looks like a bug to the user.
 *
 * Every message states the fix, not the violation: "המחיר המינימלי הוא ₪50",
 * never "ערך לא תקין".
 */

export const CONDITIONS = ['like_new', 'excellent', 'good', 'fair'] as const;

const cm = (label: string) =>
  z
    .number({ message: `${label} הוא שדה חובה` })
    .int({ message: `${label} צריך להיות מספר שלם` })
    .min(1, { message: `${label} צריך להיות גדול מאפס` })
    .max(1000, { message: `${label} נראה גדול מדי — בדקו שהמידה בסנטימטרים` });

export const listingDraftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { message: 'הכותרת קצרה מדי — לפחות 3 תווים' })
    .max(120, { message: 'הכותרת ארוכה מדי — עד 120 תווים' }),

  description: z
    .string()
    .trim()
    .max(4000, { message: 'התיאור ארוך מדי — עד 4000 תווים' })
    .default(''),

  category_slug: z.string().min(1, { message: 'בחרו קטגוריה' }),

  brand_slug: z.string().optional(),
  brand_free_text: z.string().trim().max(60).optional(),

  condition: z.enum(CONDITIONS, { message: 'בחרו את מצב הפריט' }),

  width_cm: cm('רוחב'),
  depth_cm: cm('עומק'),
  height_cm: cm('גובה'),

  price_agorot: z
    .number({ message: 'הזינו מחיר' })
    .int()
    .min(5000, { message: 'המחיר המינימלי הוא ₪50' })
    .max(100_000_000, { message: 'המחיר נראה גבוה מדי — בדקו שהוזן נכון' }),

  original_price_agorot: z.number().int().min(0).nullable().optional(),

  pickup_city: z.string().min(1, { message: 'בחרו עיר' }),
  pickup_street: z
    .string()
    .trim()
    .min(3, { message: 'הזינו רחוב ומספר בית' })
    .max(200),
  pickup_floor: z
    .number()
    .int()
    .min(0, { message: 'קומה לא יכולה להיות שלילית' })
    .max(99),
  pickup_has_elevator: z.boolean(),
  needs_disassembly: z.boolean(),
  allow_self_pickup: z.boolean(),

  notes: z.string().trim().max(1000).optional(),

  photos: z
    .array(
      z.object({
        storage_path: z.string().min(1),
        alt_text: z.string().max(200).nullable().optional(),
        width: z.number().int().positive().nullable().optional(),
        height: z.number().int().positive().nullable().optional(),
      }),
    )
    .min(3, { message: 'צריך לפחות 3 תמונות' })
    .max(10, { message: 'עד 10 תמונות' }),
});

export type ListingDraftInput = z.infer<typeof listingDraftSchema>;

/** Field-keyed errors, for rendering next to each input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
