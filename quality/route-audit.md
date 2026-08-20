# Route audit

_2026-08-20T09:35:03.109Z · http://127.0.0.1:3210 · target https://vntihvctqueohwprafwh.supabase.co_

19 routes audited — 19 clean, 0 flagged.

## Findings

None. Every route returned its expected status with a title, a description, a self-referencing canonical, and the JSON-LD its template calls for.

## Every route

| route | status | title | description | canonical | JSON-LD |
|---|---|---|---|---|---|
| `/` | 200 | Restyle — רהיטים יד שנייה איכותיים בגוש דן | רהיטים יד שנייה נבחרים, עם הובלה עד הבית ותשלום מאובטח. ספו… | http://localhost:3000 | Organization, WebSite |
| `/accessibility` | 200 | הצהרת נגישות \| Restyle | הצהרת הנגישות של Restyle — רמת ההתאמה, המגבלות הידועות ופרט… | http://localhost:3000/accessibility | Organization, WebSite |
| `/buyer-protection` | 200 | הגנת קונים \| Restyle | פריט שגוי, חלק חסר או אי-התאמה לתיאור — 48 שעות מרגע המסירה… | http://localhost:3000/buyer-protection | Organization, WebSite |
| `/cancellation-policy` | 200 | מדיניות ביטולים \| Restyle | מתי אפשר לבטל הזמנה ב-Restyle, מה העלות אחרי אישור המוכר, ו… | http://localhost:3000/cancellation-poli… | Organization, WebSite |
| `/catalog` | 200 | קטלוג רהיטים יד שנייה \| Restyle | כל הרהיטים יד שנייה הזמינים בגוש דן — ספות, שולחנות, ארונות… | http://localhost:3000/catalog | Organization, WebSite |
| `/how-it-works` | 200 | איך זה עובד \| Restyle | מפרסמים חינם, אנחנו מביאים קונה, אוספים מהבית ומעבירים את ה… | http://localhost:3000/how-it-works | Organization, WebSite, FAQPage |
| `/privacy` | 200 | מדיניות פרטיות \| Restyle | איך Restyle אוספת, שומרת ומגנה על המידע האישי שלכם, ואילו נ… | http://localhost:3000/privacy | Organization, WebSite |
| `/robots.txt` | 200 | — | — | — | — |
| `/sell` | 200 | מכירת רהיטים יד שנייה — פרסום חינם \| Restyle | מפרסמים חינם, אנחנו מביאים קונה ואוספים מהבית. התשלום מועבר… | http://localhost:3000/sell | Organization, WebSite |
| `/sell/new` | 307 | פרסום פריט \| Restyle | רהיטים יד שנייה נבחרים, עם הובלה עד הבית ותשלום מאובטח. ספו… | — | — |
| `/sell/new/submitted` | 200 | הפריט נשלח לאישור \| Restyle | רהיטים יד שנייה נבחרים, עם הובלה עד הבית ותשלום מאובטח. ספו… | — | Organization, WebSite |
| `/sitemap.xml` | 200 | — | — | — | — |
| `/terms` | 200 | תקנון ותנאי שימוש \| Restyle | התקנון המלא של Restyle — תנאי השימוש בפלטפורמה, תהליך ההזמנ… | http://localhost:3000/terms | Organization, WebSite |
| `/category/sofas-armchairs` | 200 | ספות וכורסאות יד שנייה בגוש דן \| Restyle | 0 ספות וכורסאות יד שנייה למכירה בגוש דן. הובלה עד הבית, תשל… | http://localhost:3000/category/sofas-ar… | Organization, WebSite, BreadcrumbList, ItemList |
| `/category/tables` | 200 | שולחנות יד שנייה בגוש דן \| Restyle | 0 שולחנות יד שנייה למכירה בגוש דן. הובלה עד הבית, תשלום מאו… | http://localhost:3000/category/tables | Organization, WebSite, BreadcrumbList, ItemList |
| `/category/chairs` | 200 | כיסאות יד שנייה בגוש דן \| Restyle | 0 כיסאות יד שנייה למכירה בגוש דן. הובלה עד הבית, תשלום מאוב… | http://localhost:3000/category/chairs | Organization, WebSite, BreadcrumbList, ItemList |
| `/brand/ikea` | 200 | איקאה יד שנייה — רהיטים למכירה \| Restyle | רהיטי איקאה יד שנייה בגוש דן. 0 פריטים זמינים עם הובלה ותשל… | http://localhost:3000/brand/ikea | Organization, WebSite, BreadcrumbList, ItemList |
| `/brand/habitat` | 200 | Habitat יד שנייה — רהיטים למכירה \| Restyle | רהיטי Habitat יד שנייה בגוש דן. 0 פריטים זמינים עם הובלה ות… | http://localhost:3000/brand/habitat | Organization, WebSite, BreadcrumbList, ItemList |
| `/brand/id-design` | 200 | ID Design יד שנייה — רהיטים למכירה \| Restyle | רהיטי ID Design יד שנייה בגוש דן. 0 פריטים זמינים עם הובלה … | http://localhost:3000/brand/id-design | Organization, WebSite, BreadcrumbList, ItemList |
