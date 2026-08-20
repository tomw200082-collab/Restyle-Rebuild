---
name: restyle-design-system
description: Use when building or restyling any Restyle UI — pages, React components, Tailwind classes, shadcn/ui overrides, layout, cards, buttons, badges, forms, empty states, imagery, or spacing. Triggers on "build the item page", "style this component", "add a button", "shadcn", "Tailwind", "make it look right", "design the catalog grid", "עיצוב", "רכיב". Carries the exact palette, type scale, spacing, radius and shadow tokens, plus the component conventions and the do/don't list that keep the marketplace looking like a furniture magazine rather than a SaaS dashboard.
---

# Restyle design system

Restyle sells second-hand furniture to Israeli households. The product's job is to make a used sofa feel like a considered purchase rather than a classified ad. Everything below serves that.

**The one-line brief:** warm editorial furniture magazine, photography-first. Not a gray SaaS dashboard. Not default shadcn.

## Tokens

Canonical values live in `references/tokens.css` and are mirrored into `tailwind.config.ts`. Never hardcode a hex in a component — if a colour you need isn't a token, the answer is usually an existing token, and occasionally a new token, never a literal.

### Colour

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#FAF7F2` | page background — warm off-white, the single most brand-defining value |
| `surface` | `#FFFFFF` | cards, sheets, inputs |
| `sand` | `#F3EDE4` | subtle fills, hovers, skeletons, table stripes |
| `border` | `#E5DCCF` | default hairlines |
| `border-strong` | `#D6C9B6` | inputs, focus-adjacent, dividers that must read |
| `ink` | `#22201D` | primary text, sold badge |
| `ink-muted` | `#5A544D` | secondary text, labels |
| `ink-subtle` | `#6F6961` | captions, placeholders, disabled |
| `clay` | `#A55335` | **the accent** — primary CTA, price, active state |
| `clay-hover` | `#8B462D` | accent hover/active |
| `clay-soft` | `#F7E9E2` | accent-tinted backgrounds, selected chips |
| `success` | `#3B7556` | approved, paid, completed |
| `warning` | `#886320` | pending, expiring |
| `danger` | `#B03A2E` | rejected, cancelled, destructive |

**Every one of these values clears WCAG AA (4.5:1) against every background it is actually used on** — and several were darkened from their first draft specifically to get there. `clay` fails at `#C4633F`: 3.78 on canvas and 4.04 for white-on-clay, so both the price and the primary CTA were below AA. Same for `warning` (3.03) and `ink-subtle` (3.03). Darkening is a uniform scale toward black, which preserves the hue exactly — the palette reads the same and passes.

**Before changing any colour token, check it in both directions**: the colour as text on `canvas`, `surface`, `sand` and `clay-soft`, and white as text on the colour. A badge tint is ~12% of the status colour over `surface`, so a status colour must also clear AA against its own tint. `npx lighthouse <url> --only-categories=accessibility` is the check that catches this; nothing else will.

**Accent discipline.** Clay appears on: the primary CTA, the price, and the active nav/filter state. That is the whole list. A page with four clay elements has none — the eye stops resolving which one matters. Status colours are not accents; they live on badges only.

### Type

Display **Frank Ruhl Libre** (Hebrew serif) — wordmark, H1, H2, price. Body **Heebo** — everything else. Both loaded with `hebrew` + `latin` subsets via `next/font/google`, `display: 'swap'`.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display-1` | 3.5rem / 1.1 | 500 | home hero only |
| `display-2` | 2.75rem / 1.15 | 500 | section heroes, category H1 |
| `h1` | 2.25rem / 1.2 | 500 | item title, page H1 |
| `h2` | 1.75rem / 1.25 | 500 | section headings |
| `h3` | 1.375rem / 1.3 | 600 | card titles, subsections |
| `body-lg` | 1.125rem / 1.7 | 400 | lead paragraphs, item description |
| `body` | 1rem / 1.65 | 400 | default |
| `body-sm` | 0.875rem / 1.6 | 400 | metadata, helper text |
| `caption` | 0.8125rem / 1.5 | 500 | labels, badges, table headers |

Hebrew runs shorter than Latin at equal size and its letterforms have no ascender/descender rhythm to lean on, so it needs **more line-height, not less**. Never go below 1.5 on body text. Never letter-space Hebrew — it breaks the connected reading rhythm and looks like a mistake.

Prices always render in display face at `h3`+ with `font-variant-numeric: tabular-nums`, so a column of prices aligns.

### Spacing, radius, shadow

4px base unit. Use `1 2 3 4 6 8 12 16 24` (→ 4…96px). Section vertical rhythm is `16` (64px) mobile, `24` (96px) desktop.

Radius: `sm 6px` (badges, chips) · `md 10px` (buttons, inputs) · `lg 14px` (cards, images, modals) · `full` (avatars, pills).

Shadows are nearly invisible by design — depth comes from whitespace and image weight, not elevation.
- `shadow-card`: `0 1px 2px rgba(34,32,29,.04), 0 8px 24px -12px rgba(34,32,29,.10)`
- `shadow-pop`: `0 4px 8px rgba(34,32,29,.06), 0 16px 40px -16px rgba(34,32,29,.16)` — modals, dropdowns only.

There is no third shadow. If something needs more separation, it needs more space or a border.

## Components

shadcn/ui is the substrate, always restyled. Install a primitive, then immediately replace its default greys with tokens and its default radius with ours. A component still carrying `bg-slate-*`, `rounded-md` from the generator, or `ring-offset-background` has not been adopted.

### Button

| Variant | Look |
|---|---|
| `primary` | `clay` bg, white text, `radius-md`, hover `clay-hover`, no shadow |
| `secondary` | `surface` bg, `border-strong` hairline, `ink` text, hover `sand` |
| `ghost` | transparent, `ink-muted` text, hover `sand` |
| `danger` | `danger` bg, white text — destructive confirmation only |

Heights `40px` default, `48px` for primary CTAs on item/checkout pages, `32px` for table row actions. Never a full-width button on desktop; full-width is a mobile pattern and looks unfinished at 1440px.

### Item card

The most-repeated object in the product; get it right once.

- Image `aspect-[4/3]`, `object-cover`, `radius-lg`, `sand` placeholder while loading.
- Title `h3`, clamped to 2 lines. Price `h3` in display face, clay.
- Metadata row: `body-sm` `ink-muted` — city · condition. Nothing else; a card that lists dimensions is a spec sheet.
- Hover (desktop only): image scales `1.03` over `300ms ease-out`, card does not lift or shadow.
- Sold: charcoal `ink` badge top-start reading **נמכר**, image at `opacity-60`.

### Badge

`caption` weight 500, `radius-sm`, `px-2 py-0.5`, tinted background at ~12% of the status colour with the solid colour as text. Status → colour: active/approved/paid → `success`; pending/expiring → `warning`; rejected/cancelled → `danger`; sold → `ink`; reserved/offer → `clay`.

### Form

Label above input, `caption` `ink-muted`. Input `44px` tall, `surface` bg, `border-strong`, `radius-md`. Focus: `2px` `clay` ring at 40% opacity plus a solid `clay` border — never the browser default outline, never a glow. Error text `body-sm` `danger` below the field, and the field's border turns `danger`. Helper text `body-sm` `ink-subtle`.

Never place a required-field asterisk without also marking optional fields — in a form where most fields are required, marking the minority is clearer.

### Empty state

Every list has one, and it is never just "אין תוצאות". Structure: a short heading saying what's missing, one sentence saying what to do about it, and a button that does it. Centred, `py-16`, heading `h3`, body `body` `ink-muted`. No illustration — an empty catalogue with a cartoon looks like a toy.

## Photography

Photos are the product. They get the space.

- Item page gallery is the **first** element on mobile and the start-side 60% on desktop. It is never in a card, never has a border, never has a shadow.
- Always `next/image` with real `width`/`height` (or `fill` + a sized parent). Never a raw `<img>` — layout shift on a photo-first page is the most damaging CLS there is.
- `sizes` must be set on every grid image, or mobile downloads desktop-sized files: catalog grid uses `(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw`.
- Aspect ratios: cards `4/3`, gallery main `4/3`, thumbnails `1/1`. Never distort — `object-cover` with a `sand` letterbox is correct.
- Seller photos are unretouched phone shots in real rooms. Do not apply filters, vignettes, or forced-white backgrounds; the honesty is the point and a fake-catalogue look reads as a scam on a used-goods site.

## Layout

Container `max-w-[1280px]`, page padding `4` mobile / `8` desktop. Catalog grid: 2 columns mobile → 3 tablet → 4 desktop, gap `6`.

Item page desktop is a 12-column split: gallery start-side 7, sticky purchase panel end-side 5 with `top-24`. Mobile stacks gallery → title/price → CTA → specs → description → seller → similar. The CTA sits above the fold on mobile; a buy button below a long description does not get pressed.

Admin may be denser — `body-sm` base, `32px` rows, more borders — but uses the same tokens. An admin screen in a different palette is a different product.

## Do / don't

**Do**
- Reach for whitespace before borders, and borders before shadows.
- Keep one clay element per view.
- Let images bleed to the container edge on mobile.
- Use `sand` for hover and selected states.
- Render prices with `tabular-nums` in the display face.
- Give Hebrew body text ≥1.5 line-height.

**Don't**
- Use pure `#FFF` as a page background — it kills the warmth the whole palette exists for.
- Use pure black or any `slate`/`gray`/`zinc` Tailwind default.
- Stack shadows to create hierarchy.
- Put a border and a shadow on the same element.
- Use `rounded-full` on anything rectangular — pill-shaped buttons read as consumer-app, not editorial.
- Animate anything over 300ms, or animate layout properties. Transform and opacity only.
- Add a gradient. There are no gradients in this product.
- Center-align paragraphs longer than one line.

## Directional properties

This is an RTL product. Every spacing, alignment, radius and icon direction decision must use logical properties. That rule and its full checklist live in the **hebrew-rtl-ui** skill — read it before writing any component with directional CSS.
