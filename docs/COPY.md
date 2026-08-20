# COPY — Hebrew UI copy, single source of truth

All product copy is Hebrew, RTL, written natively (not translated). Code, comments and docs stay English.

**Provenance markers**
- `[LI]` — verbatim from the live legacy app via `docs/LEGACY_INTELLIGENCE.md` §7. Reuse as-is.
- `[LI✎]` — from the legacy app **with a deliberate correction**. The correction and its reason are stated inline. See `[D-39]`.
- `[NEW]` — authored for v2 (no legacy equivalent existed).

---

## 0. Voice

Warm, direct, second-person plural (אתם/לכם) for marketing surfaces; second-person singular is avoided because it reads as ad copy in Hebrew. Concrete over clever: "משלוח עד הבית" beats "חוויית לוגיסטיקה". Never exclamation-stack. Numbers and prices always as digits with ₪ before the number (₪1,100).

Two words are load-bearing across the product and must stay consistent:
- **פריט** — a listing (never "מוצר", which reads as retail-new).
- **בקשת בירור** — a dispute (legacy term, already in published Terms; do not switch to "מחלוקת").

---

## 1. Global chrome `[NEW]`

| Key | Hebrew |
|---|---|
| `brand.wordmark` | Restyle |
| `brand.tagline` | רהיטים יד שנייה, בסטנדרט אחר |
| `nav.catalog` | קטלוג |
| `nav.howItWorks` | איך זה עובד |
| `nav.buyerProtection` | הגנת קונים |
| `nav.sell` | מכירת פריט |
| `nav.login` | כניסה |
| `nav.myAccount` | האזור האישי |
| `nav.buyerDashboard` | הרכישות שלי |
| `nav.sellerDashboard` | המכירות שלי |
| `nav.favorites` | מועדפים |
| `nav.admin` | ניהול |
| `nav.logout` | יציאה |
| `search.placeholder` | חיפוש ספה, שולחן, מותג… |
| `footer.rights` | © Restyle. כל הזכויות שמורות. |
| `footer.support` | support@restyle.co.il · 053-7252858 |

Footer link labels: איך זה עובד · הגנת קונים · תקנון · מדיניות פרטיות · מדיניות ביטולים · הצהרת נגישות

---

## 2. Home `[NEW]`

- **H1** — הרהיט הבא שלכם כבר קיים
- **Sub** — רהיטים יד שנייה נבחרים מגוש דן. אנחנו אוספים, מובילים ומגינים על הכסף שלכם — אתם רק בוחרים.
- **CTA primary** — לקטלוג · **CTA secondary** — יש לי רהיט למכירה
- Section headings: קטגוריות · חדשים בקטלוג · איך זה עובד · למה Restyle
- Trust strip: תשלום מאובטח באתר · הובלה עד הבית · 48 שעות לבדוק שהכל תקין · פרסום חינם למוכרים

---

## 3. Catalog `[NEW]`

| Key | Hebrew |
|---|---|
| `catalog.title` | קטלוג רהיטים יד שנייה |
| `filters.category` / `.price` / `.condition` / `.city` / `.brand` | קטגוריה / טווח מחירים / מצב / עיר / מותג |
| `filters.clear` | ניקוי סינון |
| `sort.newest` / `.priceAsc` / `.priceDesc` | הכי חדשים / מחיר: מהנמוך לגבוה / מחיר: מהגבוה לנמוך |
| `results.count` | {n} פריטים |
| `empty.title` | לא מצאנו פריטים שמתאימים לסינון |
| `empty.body` | נסו להרחיב את טווח המחירים או להסיר סינון. |
| `empty.cta` | ניקוי הסינון |

Condition labels — `like_new` כמו חדש · `excellent` מצב מצוין · `good` מצב טוב · `fair` מצב סביר.
(Legacy had six overlapping values including both טוב and מצב טוב; v2 uses four. Mapping in ANALYSIS §3.3.)

---

## 4. Item page `[NEW]`

| Key | Hebrew |
|---|---|
| `item.buy` | קנייה |
| `item.makeOffer` | הגשת הצעה |
| `item.favorite` / `.favorited` | הוספה למועדפים / במועדפים |
| `item.sold` | נמכר |
| `item.reserved` | בתהליך רכישה |
| `item.hasOffer` | בהצעה |
| `item.originalPrice` | מחיר קטלוגי |
| `item.specs` | מפרט |
| `item.dimensions` | מידות (ר×ע×ג) |
| `item.condition` / `.brand` / `.category` / `.city` | מצב / מותג / קטגוריה / עיר |
| `item.deliveryEstimator` | חישוב עלות הובלה |
| `item.deliveryEstimator.hint` | בחרו עיר כדי לראות את עלות ההובלה אליכם. |
| `item.selfPickup` | איסוף עצמי — ללא עלות הובלה |
| `item.seller` | המוכר |
| `item.similar` | פריטים דומים |
| `item.soldNotice` | הפריט הזה נמכר. הנה כמה פריטים דומים שזמינים עכשיו. |

Seller card shows first name + last initial and city only — never phone, never address `[D-06]`.

---

## 5. Sell `[NEW]`

**Landing `/sell`** — H1: מוכרים רהיט? אנחנו עושים את החלק הקשה · Sub: אתם מצלמים ומפרסמים. אנחנו מביאים קונה, אוספים מהבית, ומעבירים לכם את הכסף. · CTA: פרסום פריט — חינם

Fee calculator: כמה אקבל? · input מחיר מבוקש · output תקבלו: ₪{payout} · note: עמלת Restyle {pct}% נגבית רק כשהפריט נמכר. פרסום תמיד חינם.

**Wizard `/sell/new`** — steps: תמונות · פרטי הפריט · מידות ומצב · איסוף ומחיר · סיכום

| Key | Hebrew |
|---|---|
| `sell.photos.title` | מתחילים מהתמונות |
| `sell.photos.hint` | 3–10 תמונות. הראשונה היא תמונת השער. אור טבעי ורקע נקי מוכרים מהר יותר. |
| `sell.ai.working` | קוראים את התמונות ומכינים טיוטה… |
| `sell.ai.done` | הכנו טיוטה מהתמונות. עברו עליה ותקנו כל מה שצריך — אתם מאשרים הכל. |
| `sell.ai.verify` | לאמת |
| `sell.price.label` | מחיר מבוקש |
| `sell.price.payout` | **תקבלו: ₪{payout}** |
| `sell.price.payoutHint` | אחרי עמלת Restyle של {pct}%. הקונה משלם ₪{price}. |
| `sell.address.privacy` | הכתובת המדויקת פרטית ולא מוצגת באתר. מוצגים רק העיר והשכונה. |
| `sell.submit` | שליחה לאישור |
| `sell.submitted.title` | הפריט נשלח לאישור |
| `sell.submitted.body` | נעבור על הפריט ונאשר אותו בדרך כלל תוך יום עסקים. נעדכן אתכם במייל. |

`sell.price.payout` is required by `[D-36]` — the gross/net inversion from the legacy model makes it load-bearing, not decorative.

---

## 6. Offers `[NEW]`

| Key | Hebrew |
|---|---|
| `offer.title` | הגשת הצעה |
| `offer.min` | ההצעה המינימלית: ₪{min} |
| `offer.submit` | שליחת הצעה |
| `offer.pending` | ההצעה נשלחה. למוכר יש 72 שעות להשיב. |
| `offer.accepted` | ההצעה התקבלה! יש לכם 24 שעות להשלים את הרכישה במחיר שסוכם. |
| `offer.declined` | ההצעה נדחתה. |
| `offer.countered` | המוכר הציע ₪{amount}. |
| `offer.expired` | ההצעה פגה. |
| `offer.stillAvailable` | שימו לב: הפריט נשאר זמין לרכישה במחיר המלא עד שתשלימו את הרכישה. |
| `offer.actions` | קבלה / דחייה / הצעה נגדית |

---

## 7. Checkout `[NEW]`

| Key | Hebrew |
|---|---|
| `checkout.title` | השלמת רכישה |
| `checkout.delivery` / `.selfPickup` | הובלה עד הבית / איסוף עצמי |
| `checkout.address` / `.city` / `.street` / `.floor` / `.elevator` | כתובת למסירה / עיר / רחוב ומספר / קומה / יש מעלית |
| `checkout.summary` | סיכום הזמנה |
| `checkout.item` / `.deliveryFee` / `.total` | מחיר הפריט / הובלה / סה"כ לתשלום |
| `surcharge.floor` | תוספת קומה (ללא מעלית) |
| `surcharge.disassembly` | פירוק והרכבה |
| `checkout.pay` | לתשלום מאובטח |
| `checkout.terms` | בלחיצה על תשלום אתם מאשרים את התקנון ומדיניות הביטולים. |
| `checkout.protection` | הכסף מוגן: יש לכם 48 שעות אחרי המסירה לוודא שהכל תקין. |
| `checkout.success.title` | התשלום התקבל |
| `checkout.success.body` | שלחנו למוכר בקשת אישור. יש לו 48 שעות לאשר. אם לא יאשר — הכסף יוחזר לכם אוטומטית במלואו. |
| `checkout.cancelled.title` | התשלום לא הושלם |

The success copy states the auto-refund guarantee explicitly. It is the direct answer to the legacy failure mode where 72% of buyers waited on a seller who never replied `[LI §2]`.

---

## 8. Dashboards `[NEW]`

Buyer: הרכישות שלי · ההצעות שלי · מועדפים. Seller: הפריטים שלי · המכירות שלי · תשלומים.

Order status labels:

| Status | Hebrew |
|---|---|
| `pending_seller_confirmation` | ממתין לאישור המוכר |
| `confirmed` | המוכר אישר |
| `delivery_scheduled` | הובלה נקבעה |
| `picked_up` | נאסף מהמוכר |
| `delivered` | נמסר |
| `completed` | הושלם |
| `cancelled` | בוטל |
| `disputed` | בבירור |
| `refunded` | הוחזר |

Listing status labels: טיוטה · ממתין לאישור · פעיל · בתהליך רכישה · נמכר · נדחה · פג תוקף · הוסר.

Seller actions: אישור המכירה · בחירת מועדי איסוף · חידוש פרסום · הסרה.
Buyer actions: ביטול הזמנה · פתיחת בקשת בירור · מכירה מחדש ללא עמלה `[D-41]`.

`seller.confirm.deadline` — יש לכם {hours} שעות לאשר. אם לא תאשרו, ההזמנה תבוטל והכסף יוחזר לקונה.

---

## 9. Admin `[NEW]`

Nav: לוח בקרה · אישור פריטים · פריטים · הזמנות · הובלות · תשלומים · בירורים · הגדרות.

KPIs: מחזור (GMV) · עמלות · פריטים פעילים · ממתינים לאישור · שיעור המרה · **שיעור אישור מוכרים** · **זמן ממוצע לאישור** · **הכנסות הובלה מול עלות**.

The last three exist because of `[D-43]` and `[D-37]` — seller-confirmation failure killed the pilot, and the v2 zone fees carry a margin risk that only shows up in aggregate.

Review queue: אישור / דחייה · סיבת דחייה (נשלחת למוכר) · required on reject.
Deliveries: שיבוץ צוות · שם הצוות · טלפון · חלון איסוף · חלון מסירה · מניפסט יומי · העתקה לוואטסאפ.
Shifts: בוקר 09:00–12:00 · צהריים 12:00–16:00 · ערב 16:00–19:00 `[LI §3]`, `[D-32]`.
Payouts: ממתין / שולם · סימון כשולם · אופן העברה.
Disputes: החזר מלא · החזר חלקי · דחיית הבקשה · נימוק.

---

## 10. Errors, empty and system states `[NEW]`

| Key | Hebrew |
|---|---|
| `404.title` / `.body` / `.cta` | הדף לא נמצא / הקישור אולי ישן, או שהפריט הוסר. / לקטלוג |
| `500.title` / `.body` | משהו השתבש אצלנו / נסו לרענן. אם זה חוזר, כתבו לנו ל-support@restyle.co.il |
| `auth.required` | צריך להתחבר כדי להמשיך |
| `form.required` | שדה חובה |
| `form.minPrice` | המחיר המינימלי הוא ₪50 |
| `form.photosMin` | צריך לפחות 3 תמונות |
| `form.outOfArea` | מצטערים, המשלוח זמין רק באזור גוש דן `[LI]` |
| `rate.limited` | יותר מדי בקשות. נסו שוב בעוד רגע. |
| `generic.retry` | לא הצלחנו. נסו שוב. |

`form.outOfArea` is reused verbatim from the legacy `ShippingEngine` — it is already the wording customers have seen.

---

## 11. Email templates

Sender name **Restyle**, from `hello@restyle.co.il`, reply-to `support@restyle.co.il` `[LI §5]`.
Footer on every email `[LI §7.7]`:
> המוצר הזה נרכש דרך Restyle — מרקטפלייס רהיטים אמין, שקוף ונעים.
> לשאלות או תמיכה לחצו כאן

| Template | Subject | Provenance |
|---|---|---|
| `listing_approved` | הפריט שלך אושר ומפורסם | `[LI]` |
| `listing_rejected` | נדרש תיקון קטן לפני פרסום | `[LI]` |
| `seller_purchase_request` | יש קונה מעוניין ב{item} – נדרש אישור | `[LI✎]` |
| `seller_confirm_reminder` | תזכורת: יש קונה שממתין לאישור שלך | `[NEW]` `[D-43]` |
| `buyer_order_received` | קיבלנו את ההזמנה — ממתינים לאישור המוכר | `[LI✎]` |
| `buyer_order_confirmed` | המוכר אישר — מתאמים הובלה | `[LI]` |
| `delivery_scheduled` | מועד ההובלה נקבע | `[LI]` |
| `buyer_delivered` | הרהיט הגיע – תתחדשו | `[LI]` |
| `order_cancelled_refund` | ההזמנה בוטלה – הזיכוי בדרך | `[LI]` |
| `seller_timeout_cancelled` | הבקשה בוטלה אוטומטית | `[LI]` |
| `payout_paid` | הכסף מהמכירה בדרך אליך | `[LI]` |
| `offer_received` / `offer_accepted` / `offer_declined` | קיבלת הצעה על {item} / ההצעה שלך התקבלה / ההצעה שלך נדחתה | `[NEW]` |
| `dispute_received` | קיבלנו את בקשת הבירור שלך | `[LI]` |
| `dispute_resolved` | בקשת הבירור שלך טופלה | `[LI]` |

**Corrected body copy `[LI✎]`:**

- `seller_purchase_request` — legacy said the buyer *proposed windows* and no money had moved. In v2 the buyer has already paid, so the copy must say so; it is the strongest possible reason for a seller to respond:
  > יש קונה שכבר שילם על {item} 🎉
  > הכסף מוחזק אצלנו. כל מה שנדרש ממך: לאשר את המכירה ולבחור מועדי איסוף.
  > **יש לך {hours} שעות לאשר.** אם לא נשמע ממך, ההזמנה תבוטל והכסף יוחזר לקונה.

- `buyer_order_received` — legacy said „לא חויבת ולא נגבה ממך כסף" (request-first). Under v2 the buyer *has* been charged, so that line would be false:
  > קיבלנו את ההזמנה שלך ואת התשלום.
  > שלחנו למוכר בקשת אישור — יש לו {hours} שעות לאשר.
  > אם המוכר לא יאשר בזמן, ההזמנה תבוטל והכסף יוחזר לך אוטומטית במלואו.

- `buyer_delivered` — legacy said „יש לכם 24 שעות לוודא שהכל תקין"; v2 grants 48 (§7 C-4):
  > הרהיט הגיע – תתחדשו!
  > יש לכם **48 שעות** לוודא שהכל תקין. אחרי זה נעביר את התשלום למוכר.

**Not carried over `[LI §8.17]`:** the hardcoded personal Gmail for admin alerts (v2 uses `ADMIN_EMAIL`), and the inconsistent `tom@restyle.co.il` support link (v2 uses `support@restyle.co.il` everywhere).

---

## 12. Legal pages

Full Hebrew source: `docs/LEGACY_INTELLIGENCE.md` §7.1–7.4, reused **verbatim** except as noted. Page components render from that text.

| Page | Route | Provenance |
|---|---|---|
| תקנון ותנאי שימוש | `/terms` | `[LI✎]` — §7 corrected 12h → **48 שעות** |
| מדיניות פרטיות | `/privacy` | `[LI✎]` — §1 processor list → provider-neutral wording |
| מדיניות ביטולים | `/cancellation-policy` | `[LI]` verbatim (₪50 fee implemented per `[D-40]`) |
| הצהרת נגישות | `/accessibility` | `[LI]` verbatim — coordinator תום ויט, 053-7252858 |
| איך זה עובד | `/how-it-works` | `[LI✎]` — buyer step 2 reworded for pay-at-checkout; FAQ „48 שעות" already correct |
| הגנת קונים | `/buyer-protection` | `[LI✎]` — „12 שעות מרגע המסירה" → **„48 שעות מרגע המסירה"** |

**The three corrections, stated exactly** (`[D-39]`):

1. **Terms §7:** „בתוך 12 שעות ממועד המסירה" → „בתוך 48 שעות ממועד המסירה".
2. **Buyer Protection, step 1:** „יש לך 12 שעות מרגע המסירה" → „יש לך 48 שעות מרגע המסירה".
3. **Privacy §1:** „(כמו PAYME / Tranzila / Morning)" → „(ספק סליקה מאובטח המורשה לפעול בישראל)".

Everything else — all 19 Terms sections, all 9 Privacy sections, the full Cancellation Policy, the Accessibility statement, both How It Works tracks and every FAQ answer, and the Buyer Protection page — is reproduced without a word changed.

**Retained promises that the build must honour**, because they are published and legally visible:
- ₪50 cancellation fee after seller confirmation → `[D-40]`
- Free resale within 7 days of delivery → `[D-41]`
- Accessibility replies within 2 business days → operational, noted in RUNBOOK
- „הכסף שלכם שמור ומוגן אצלנו" → **now literally true** in v2 (funds are captured and held until completion), where in the legacy pilot it was aspirational `[LI §8.16]`
