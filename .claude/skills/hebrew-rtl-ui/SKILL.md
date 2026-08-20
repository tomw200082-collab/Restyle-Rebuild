---
name: hebrew-rtl-ui
description: Use whenever writing Restyle UI that has direction, Hebrew text, or locale-formatted values — any component with margins, padding, alignment, borders, icons, carousels, breadcrumbs, tables, or form fields, and anything rendering currency, dates, times, phone numbers or counts. Triggers on "RTL", "direction", "Hebrew", "he-IL", "form", "input", "icon", "chevron", "arrow", "carousel", "date", "currency", "₪", "shekel", "number format", "placeholder", "error message". Carries the logical-properties rule, the icon-mirroring list, Intl formatting recipes, Hebrew form UX, and the RTL breakage checklist.
---

# Hebrew RTL UI

Restyle is a Hebrew-first product. RTL is the native direction, not a translation mode bolted on — there is no LTR version to keep working. That simplifies things: you never write direction-conditional CSS, you write direction-agnostic CSS.

`<html lang="he" dir="rtl">` is set in the root layout and never overridden.

## Logical properties, always

**The rule: never write `left` or `right` in CSS or Tailwind.** Use the logical axis, which resolves correctly under `dir="rtl"` without any `rtl:` variant.

| Never | Always | Tailwind |
|---|---|---|
| `margin-left` | `margin-inline-start` | `ms-*` |
| `margin-right` | `margin-inline-end` | `me-*` |
| `padding-left` | `padding-inline-start` | `ps-*` |
| `padding-right` | `padding-inline-end` | `pe-*` |
| `left: 0` | `inset-inline-start: 0` | `start-0` |
| `right: 0` | `inset-inline-end: 0` | `end-0` |
| `text-align: left` | `text-align: start` | `text-start` |
| `border-left` | `border-inline-start` | `border-s` |
| `border-radius` corners | `border-start-start-radius` etc. | `rounded-s-*`, `rounded-e-*` |
| `float: left` | `float: inline-start` | — |

`mx-*`, `px-*`, `inset-x-*`, `space-x-*` and `gap` are axis-symmetric and safe.

Flexbox and grid follow the writing mode automatically — `flex-row` already runs right-to-left. **Never** use `flex-row-reverse` to "fix" RTL; it double-flips and breaks the moment someone views a component in isolation. If a row looks backwards, something upstream used a physical property.

**Review heuristic:** `grep -nE '\b(ml|mr|pl|pr|left|right|text-left|text-right|border-l|border-r|rounded-l|rounded-r)-' src/` should return nothing but false positives in third-party code. Run it before every commit that touches components. Any real hit is a bug even if it currently looks fine, because it will be wrong the first time it appears in a mirrored context.

## Icons

Direction-bearing icons must mirror; direction-neutral icons must not. Getting this backwards is the most common RTL polish failure and it reads as broken rather than as a small slip.

**Mirror** (`scale-x-[-1]` or use the opposite icon):
- Chevrons and arrows used for navigation: back/forward, next/previous, breadcrumb separators, carousel controls, pagination, "see more" affordances, dropdown-to-the-side indicators.
- Anything indicating flow or progress along the reading axis: step arrows, sliders' fill direction, progress bars.
- `ArrowLeft` as "back" becomes visually right-pointing. Prefer importing the semantically-opposite icon over transform-flipping, so the DOM matches what the user sees.

**Do not mirror**:
- Clocks, checkmarks, X, plus/minus, search, heart, star, trash, camera, user, home, bell, settings, lock, envelope, phone.
- Logos and brand marks, ever.
- Chevron **down/up** (accordion, select) — the vertical axis is unaffected by direction.
- Media transport controls (play/pause) — universally LTR by convention, even in RTL locales.

**Carousels and galleries:** with `dir="rtl"`, a native scroll container's `scrollLeft` goes **negative** in Chrome/Firefox and the "start" edge is the right edge. Never compute scroll positions with hardcoded signs. Use `element.scrollBy({ left: -delta })` where `delta` is the *logical* forward direction, or drive by `scrollIntoView({ inline: 'start' })`, which is direction-aware. Test the item gallery by actually dragging it — this is the single most likely thing to be silently backwards.

**Breadcrumbs:** the DOM order is semantic (outermost first) and flex handles the visual flip. Only the separator glyph mirrors. Never reverse the array.

## Numbers, currency, dates

Numbers are **always LTR runs inside RTL text.** Hebrew renders digits left-to-right natively via the bidi algorithm, but a number adjacent to punctuation or a currency symbol can reorder visually in ways that look like corruption. Wrap the risky cases.

```ts
// src/lib/format.ts — the only place these live.
const HE = 'he-IL';

export const formatPrice = (agorot: number) =>
  new Intl.NumberFormat(HE, {
    style: 'currency', currency: 'ILS',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(agorot / 100);                    // → ‏₪1,100

export const formatNumber = (n: number) => new Intl.NumberFormat(HE).format(n);

export const formatDate = (d: Date | string) =>
  new Intl.DateTimeFormat(HE, { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(d));                     // → 20 באוגוסט 2026

export const formatShortDate = (d: Date | string) =>
  new Intl.DateTimeFormat(HE, { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(d));                     // → 20.08.2026

export const formatTime = (d: Date | string) =>
  new Intl.DateTimeFormat(HE, { hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(d));                     // → 14:30
```

Rules that follow:

- **Prices never show agorot.** Israeli furniture prices are whole shekels; `₪1,100.00` reads as a foreign import. `minimumFractionDigits: 0`.
- **Money is stored in agorot and divided only at the formatting boundary.** Never let a shekel float exist in application code.
- **Israeli dates are day-first.** `20.08.2026`, never `08/20/2026`, and never ISO in user-facing text.
- **Times are 24-hour.** `hour12: false`. `2:30 PM` is not an Israeli format.
- **Phone numbers stay LTR and unformatted by `Intl`**: render `053-7252858` inside `<span dir="ltr">`, otherwise a leading `0` can visually migrate.
- **Any mixed-direction inline value** — a phone number, an email address, a Latin brand name mid-sentence, a URL — goes in `<span dir="ltr">` or is wrapped with `⁦`/`⁩` isolates. Without isolation, adjacent punctuation lands on the wrong side.
- Use `<bdi>` for user-generated names in lists, where you cannot know the script in advance.

**Dimensions** render as `רוחב × עומק × גובה` with the numbers in logical order: `180 × 90 × 75 ס"מ`. Because `×` is bidi-neutral, wrap the whole run in `<span dir="ltr">` so it doesn't reorder to `75 × 90 × 180`.

## Hebrew form UX

- **Labels sit above inputs**, always. Hebrew label text is variable-width and side-labels create a ragged start edge.
- Text inputs inherit `dir="rtl"`. **Exceptions that must be `dir="ltr"` with `text-align: start`:** email, URL, phone, numeric price, and any field holding a Latin brand name. Typing an email in an RTL input puts the `@` in a visually wrong position and users delete correct input trying to fix it.
- **Placeholders are examples, not labels.** `לדוגמה: ספה תלת מושבית` — not `שם הפריט`, which duplicates the label and disappears on focus.
- **Error text goes below the field**, `body-sm`, `danger`, and states the fix rather than the violation: `המחיר המינימלי הוא ₪50`, not `ערך לא תקין`.
- **Never mark required fields with only an asterisk.** In a form where most fields are required, mark the optional minority: append `(אופציונלי)` to optional labels.
- **Validation messages are Hebrew and specific.** Zod messages are authored in Hebrew at the schema, so client and server produce identical text.
- **Number inputs** use `inputMode="numeric"` and `dir="ltr"`. Never `type="number"` for prices — it permits `e`, `+`, exponents and scroll-wheel mutation.
- **Selects and comboboxes** open aligned to the inline-start edge; verify the dropdown doesn't overflow the viewport's right edge, which is the *start* edge here.
- Buttons in a dialog footer read primary-first along the inline axis: the primary action sits at the inline-start.

## Text handling

- **Never letter-space Hebrew** (`tracking-*`). It severs the connected reading rhythm and looks like a rendering fault.
- **Line-height ≥ 1.5** on body text; Hebrew has no ascender/descender rhythm to carry tight leading. Headings may go to 1.15–1.3.
- **Never `text-transform: uppercase`** — Hebrew is unicameral, so it does nothing to Hebrew and shouts at any embedded Latin.
- **Don't justify text.** Hebrew justification produces large inter-word gaps without hyphenation support.
- `line-clamp` works normally; check that the ellipsis lands on the correct side (it will, if you haven't used physical properties).
- Left-align nothing. `text-start` for body, `text-center` only for genuinely centred elements like empty states.

## RTL breakage checklist

Run through this on any new component before calling it done:

1. `grep` for physical properties in the diff — none present.
2. Icons: every chevron/arrow points the correct way; no clock or checkmark got flipped.
3. Carousel/gallery drags and its arrow buttons move in the expected direction.
4. Focus ring is fully visible and not clipped by an `overflow-hidden` parent.
5. Tooltips, popovers and dropdowns open toward the viewport centre, not off the start edge.
6. Tables: header alignment matches cell alignment; numeric columns are `text-end` with `tabular-nums`.
7. Any embedded LTR content (email, phone, URL, Latin brand) is direction-isolated.
8. Long Hebrew strings don't overflow — test with a 60-character title, since Hebrew has no obvious word-break points for the browser to exploit.
9. Absolutely-positioned badges use `start-*`/`end-*`, not `left-*`/`right-*`.
10. Loading skeletons match the real content's inline direction and width.
