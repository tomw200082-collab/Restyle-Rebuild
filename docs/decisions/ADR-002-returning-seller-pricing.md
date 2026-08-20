# ADR-002 — The pricing inversion for returning sellers

- **Status:** Proposed — **awaiting the operator's decision**
- **Date:** 2026-08-20
- **Deciders:** the operator (Tom). This is a business call, not an engineering one.
- **Implementation status:** **none, deliberately.** Master Prompt 2 §8.3 says do not
  implement. Nothing in this run changes pricing behaviour for returning
  sellers.

---

## Context

The legacy Base44 platform and v2 ask the seller for **different numbers**, and
the field looks the same in both.

| | legacy | v2 |
|---|---|---|
| What the seller types | the amount they want to **receive** (net) | the item's **asking price** (gross) |
| What the buyer sees | net + commission, computed and displayed | exactly what the seller typed |
| Where commission goes | added **on top** | deducted **from** it |

The consequence, stated as plainly as it deserves:

> **A returning seller who types the number they typed last time receives 20%
> less.**

On a ₪1,000 sofa: legacy paid out ₪1,000 and charged the buyer ₪1,200. v2 pays
out ₪800 and charges the buyer ₪1,000.

The software side is finished and is not the problem. The sell wizard shows a
live payout figure beside the price input `[D-36]`, the Hebrew is explicit about
which number is which, and the importer takes `display_price` so imported
listings carry the gross figure. A seller reading the screen will understand it.
The risk is the seller who does not read a field they believe they already know.

## The forces

**For v2's model (gross).** It is what every consumer marketplace does — AptDeco,
eBay, Vinted, Facebook Marketplace. The buyer sees one price and pays it, which
is the whole reason a marketplace feels trustworthy. A net-priced model has to
display a number the seller never typed, and any change to the commission
silently changes the buyer-facing price of every listing in the catalogue.

**Against.** The legacy cohort is the most valuable seller list Restyle has:
people who have already listed, already sold, and already trust the platform.
Surprising them on money is the single most expensive way to lose them, and the
loss is silent — they do not complain, they simply do not list again.

**Size of the affected group.** Every legacy seller with a completed sale, which
is knowable from `legacy_users` and `legacy_orders` once the Base44 export
arrives. It has not arrived, so this ADR cannot state the number, and **the
number should decide the option.** See "What is missing" below.

## Options

### A. Do nothing beyond what is already built

Ship the gross model. The wizard already shows the payout figure live.

- **Money impact:** none, versus the current build.
- **Risk:** a returning seller lists at their old number, receives 20% less,
  and either asks for a correction or quietly stops using the platform.
- **Effort:** zero.

### B. Do nothing in the product; email the legacy cohort before they list

One message to legacy sellers explaining that the price field now means the
asking price, with a worked example.

- **Money impact:** none. It changes what people expect, not what they are paid.
- **Risk:** an email nobody opens. Mitigated by repeating the point in the
  wizard, which already does it.
- **Effort:** one template plus a send. `outbound_events` already carries the
  channel and the idempotency key, so it is a small script.
- **Depends on:** the legacy export, for the address list.

### C. Prefill the wizard for a recognised returning seller

When a seller's email matches a `legacy_users` row, prefill the price field with
the **gross equivalent** of their most recent legacy price (`net ÷ 0.8`) and say
so in a note above the field.

- **Money impact:** none — it changes the default, not the rule.
- **Risk:** a prefilled number that is wrong for *this* item is worse than an
  empty field, and it invites the seller to accept a price they did not choose.
- **Effort:** a `legacy_users` lookup in the wizard, plus copy.
- **Depends on:** the legacy export.

### D. A one-off commission discount for the first legacy relist

Set `commission_pct_override` to make the first relisting by a legacy seller
match their old take-home.

- **Money impact:** **real.** Roughly 20% of the item price, once per returning
  seller. On a hundred returning sellers at a ₪1,000 median that is about
  ₪20,000 of forgone commission.
- **Risk:** it teaches the cohort that the rate is negotiable, and the second
  listing is a second surprise — the discount postpones the conversation rather
  than having it.
- **Effort:** small. `commission_pct_override` already exists on `listings` and
  the fee engine already honours it `[D-41]`.

### E. Change the model back to net

Ask sellers for their take-home and display gross to buyers.

- **Money impact:** none directly, but every buyer-facing price rises by 25%
  overnight, and the catalogue is the growth thesis.
- **Risk:** high, and in the direction of the buyer, who is the scarcer side of
  this marketplace.
- **Effort:** large. It touches the fee engine, the wizard, the importer, every
  price display, and the published fee page.

## Recommendation

**B, and only B, once the legacy export arrives.**

The gross model is right and every consumer marketplace the operator is
competing with uses it. The problem is not the model, it is a **one-time
expectation mismatch in one cohort** — and an expectation problem is answered
with a message, not with an exception in the fee engine.

C is worth a second look only if the export shows the returning cohort is both
large and concentrated in repeat listers. D is the option to resist: it costs
real money, it postpones rather than resolves the surprise, and a discount given
once to a group is very hard to take back.

Whatever is chosen, one thing is worth doing regardless: **watch the first
cohort of returning sellers.** `listings.seller_id` joined to `legacy_users` by
email answers "did they list again, and at what price?" within a week of launch,
and that measurement is worth more than this entire document.

## What is missing, and why this ADR stops here

`legacy_users` and `legacy_orders` are **empty** — the Base44 export has not been
delivered. Without it this ADR cannot say how many sellers are affected, what
their median price was, or how many listed more than once. Those three numbers
decide between B and C, and possibly rule out both.

So this is a proposal, not a decision, and the honest next step is the export
rather than a choice made without it.

## Decision

**Pending.** No code has been written for any option, per Master Prompt 2 §8.3.

When the operator decides, that decision becomes an entry in
`docs/DECISIONS.md` and this ADR's status changes to Accepted with the option
named.
