# Listing curator — review queue

_2026-08-20 · `listing-curator` · target `vntihvctqueohwprafwh` (production) · **advisory only**_

## Queue: empty

```sql
select count(*) from listings where status = 'pending_review';  -- 0
select count(*) from listings;                                  -- 0
```

**0 listings awaiting review. 0 listings of any status.** Nobody has signed in,
so no seller exists, so nothing has been submitted. There is nothing to curate.

This is a real result, not a failed query — the run is recorded so the next
person does not repeat it against the same empty queue. Re-run after P1 seeds
demo content, or once real sellers arrive.

## The checks that would have run, and their thresholds

Recorded here so the first real queue is reviewed against a fixed standard
rather than an improvised one.

**Photos** — count against `min_photos` (3) and `max_photos` (10) from
`site_config`; flag near-identical shots (one angle repeated); flag a first
photo that is a detail rather than the whole item, because it is the catalogue
thumbnail and therefore the click-through rate.

**Title** — 3–120 characters (a CHECK constraint, so a violation cannot reach
the queue); Hebrew, since a Latin-only title is a `CLAUDE.md` §3.5 defect;
contains the item type, ideally brand and one distinguishing trait; no price, no
phone number, no ALL CAPS, no emoji spam.

**Description** — says something the photos do not; **no contact details**,
flagged every time, because taking the transaction off-platform removes the
buyer's protection and the platform's commission, and that is how the legacy
platform leaked.

**Dimensions** — present (all three are `not null`, 1–1000) and plausible for
the category; a 400cm armchair is a typo, and a wrong dimension is a crew
arriving with the wrong van. Flag when they imply a `bulky` size class so the
surcharge is expected at checkout rather than a surprise.

**Price** — above `min_price_agorot` (₪50); reported against comparables as a
range and a percentile, never as a verdict. **Both tails matter**: far above
comparables will not sell and occupies the queue; far below may be a typo, or a
listing about to be regretted.

**Policy** — category and item plausibly match; inside the furniture scope;
pickup city inside the service area, otherwise no delivery option exists and the
buyer finds that out at checkout.

## Known limitation on the first real queue

Price comparables need a population. With fewer than roughly ten sold or active
items in a category, a percentile is noise. The honest output in that case is
*"cannot compare — 2 active items in this category"*, not a confident number
from a sample of two.

## Boundary

Advisory only. This agent never approves, rejects, edits or transitions a
listing. Approval stays human — it is the product's main trust mechanism, since
buyers are trusting Restyle rather than the seller.
