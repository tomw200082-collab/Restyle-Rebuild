/**
 * Demo catalogue content.
 *
 * Deliberately *not* `db/seed-data.ts`. That file is the staging seed: it also
 * creates three accounts with a known password and forty fixture listings, and
 * the run-1 handoff is explicit that it is a staging tool, not a production
 * one. This is the set that goes on the live project, and everything in it is
 * flagged `is_demo` so `npm run purge-demo` can take it all back out. [D-75]
 *
 * Rules the content follows, because it will sit next to real inventory:
 *
 *  - Hebrew titles a real seller would write — the item, then what
 *    distinguishes it. No lorem, no "פריט בדיקה".
 *  - Prices that make sense against the Israeli second-hand market, and above
 *    `min_price_agorot`.
 *  - Real dimensions, so `classify_size` produces a real spread of standard and
 *    bulky items and the delivery-margin KPI has something to measure. [D-72]
 *  - Cities drawn from the actual delivery zones, across all three bands, so
 *    the zone fee is exercised rather than assumed.
 *  - One sold item, because "sold pages never 404" is an invariant with a gate
 *    stage behind it and it needs a sold page to check. [D-33]
 */

export type DemoUser = {
  /** Stable, so a re-run updates rather than duplicates. */
  id: string;
  email: string;
  fullName: string;
  city: string;
  phone: string;
};

export type DemoListing = {
  sellerIndex: 0 | 1 | 2;
  categorySlug: string;
  brandSlug?: string;
  title: string;
  description: string;
  condition: 'like_new' | 'excellent' | 'good' | 'fair';
  priceAgorot: number;
  originalPriceAgorot?: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  city: string;
  floor: number;
  hasElevator: boolean;
  needsDisassembly: boolean;
  status?: 'active' | 'sold';
};

/**
 * A fixed password, and it is safe *because* of what these accounts are: three
 * demo sellers with no payout details, no real email, and nothing to steal.
 * They are removed by the purge along with their listings. A real account is
 * never created by this script.
 */
export const DEMO_PASSWORD = 'restyle-demo-2026';

export const DEMO_USERS: DemoUser[] = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    email: 'demo.noa@restyle.co.il',
    fullName: 'נעה ברקוביץ',
    city: 'תל אביב-יפו',
    phone: '050-0000001',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    email: 'demo.yonatan@restyle.co.il',
    fullName: 'יונתן אלמוג',
    city: 'רמת גן',
    phone: '050-0000002',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003',
    email: 'demo.shira@restyle.co.il',
    fullName: 'שירה כהן',
    city: 'הרצליה',
    phone: '050-0000003',
  },
];

export const DEMO_LISTINGS: DemoListing[] = [
  // --- ספות וכורסאות -------------------------------------------------------
  {
    sellerIndex: 0,
    categorySlug: 'sofas-armchairs',
    brandSlug: 'ikea',
    title: 'ספה תלת-מושבית אפור בהיר',
    description:
      'ספה נוחה במיוחד, ריפוד בד אפור בהיר שנשאר נקי. שימשה בסלון של דירה ללא ילדים ' +
      'וללא חיות מחמד. הכריות ניתנות להסרה ולכביסה. נמכרת בגלל מעבר דירה.',
    condition: 'excellent',
    priceAgorot: 180_000,
    originalPriceAgorot: 420_000,
    widthCm: 210,
    depthCm: 90,
    heightCm: 82,
    city: 'תל אביב-יפו',
    floor: 3,
    hasElevator: false,
    needsDisassembly: false,
  },
  {
    sellerIndex: 1,
    categorySlug: 'sofas-armchairs',
    title: 'כורסת קריאה בד בוקלה שמנת',
    description:
      'כורסה בעיצוב נורדי עם רגלי עץ אלון מלא. גובה ישיבה נוח, מושלמת לפינת קריאה. ' +
      'הבד נקי לחלוטין, ללא כתמים או קרעים.',
    condition: 'like_new',
    priceAgorot: 95_000,
    widthCm: 80,
    depthCm: 85,
    heightCm: 95,
    city: 'רמת גן',
    floor: 1,
    hasElevator: true,
    needsDisassembly: false,
  },
  {
    sellerIndex: 2,
    categorySlug: 'sofas-armchairs',
    title: 'ספת פינתית ימנית בצבע חרדל',
    description:
      'ספה פינתית גדולה עם מנגנון פתיחה למיטה זוגית. צבע חרדל חם שמתאים לסלון גדול. ' +
      'סימני שימוש קלים על המשענת השמאלית, מצולם בתמונות.',
    condition: 'good',
    priceAgorot: 240_000,
    originalPriceAgorot: 590_000,
    widthCm: 280,
    depthCm: 180,
    heightCm: 85,
    city: 'הרצליה',
    floor: 0,
    hasElevator: true,
    needsDisassembly: true,
  },

  // --- שולחנות -------------------------------------------------------------
  {
    sellerIndex: 0,
    categorySlug: 'tables',
    brandSlug: 'rahitey-doron',
    title: 'שולחן אוכל עץ אלון ל-6 סועדים',
    description:
      'שולחן עץ אלון מלא בגימור שמן טבעי. משטח חזק שנשאר יציב לחלוטין. ' +
      'סימני שימוש עדינים שמוסיפים אופי לעץ. הכיסאות אינם כלולים.',
    condition: 'good',
    priceAgorot: 145_000,
    widthCm: 180,
    depthCm: 90,
    heightCm: 75,
    city: 'תל אביב-יפו',
    floor: 2,
    hasElevator: true,
    needsDisassembly: true,
  },
  {
    sellerIndex: 1,
    categorySlug: 'tables',
    title: 'שולחן סלון שיש לבן ורגלי פליז',
    description:
      'שולחן קפה עגול עם משטח שיש לבן אמיתי ורגלי מתכת בגימור פליז. ' +
      'כבד ויציב מאוד. פגם קטן בקצה המשטח, לא בולט לעין.',
    condition: 'good',
    priceAgorot: 68_000,
    widthCm: 90,
    depthCm: 90,
    heightCm: 42,
    city: 'רמת גן',
    floor: 4,
    hasElevator: true,
    needsDisassembly: false,
  },
  {
    sellerIndex: 2,
    categorySlug: 'tables',
    title: 'שולחן עבודה מתכוונן חשמלי',
    description:
      'שולחן עמידה/ישיבה עם מנוע חשמלי שקט, זיכרון לארבעה גבהים. משטח למינציה ' +
      'בגוון אגוז. עובד מצוין, נמכר בגלל מעבר לעבודה מהמשרד.',
    condition: 'excellent',
    priceAgorot: 110_000,
    originalPriceAgorot: 240_000,
    widthCm: 160,
    depthCm: 80,
    heightCm: 75,
    city: 'הרצליה',
    floor: 1,
    hasElevator: false,
    needsDisassembly: true,
  },

  // --- כיסאות --------------------------------------------------------------
  {
    sellerIndex: 0,
    categorySlug: 'chairs',
    title: 'ארבעה כיסאות אוכל עץ ביץ׳ וקש',
    description:
      'סט של ארבעה כיסאות בסגנון וינה, מושב קש שזור ביד. שניים מהם עברו החלפת ' +
      'קש לפני שנה. מחיר לסט כולו.',
    condition: 'good',
    priceAgorot: 52_000,
    widthCm: 45,
    depthCm: 50,
    heightCm: 90,
    city: 'תל אביב-יפו',
    floor: 3,
    hasElevator: false,
    needsDisassembly: false,
  },
  {
    sellerIndex: 1,
    categorySlug: 'chairs',
    brandSlug: 'ikea',
    title: 'שני כיסאות בר גובה 65 ס״מ',
    description: 'כיסאות בר עם משענת נמוכה ומושב מרופד בבד אפור כהה. גובה מתאים לאי מטבח סטנדרטי.',
    condition: 'excellent',
    priceAgorot: 28_000,
    widthCm: 42,
    depthCm: 45,
    heightCm: 95,
    city: 'גבעתיים',
    floor: 2,
    hasElevator: true,
    needsDisassembly: false,
  },

  // --- מיטות ומזרנים -------------------------------------------------------
  {
    sellerIndex: 2,
    categorySlug: 'beds-mattresses',
    brandSlug: 'silon',
    title: 'מיטה זוגית 160 עם ארגז מצעים',
    description:
      'מסגרת מיטה זוגית עם ארגז מצעים בהרמה גזית. ריפוד בד אפור. המזרן אינו כלול. ' +
      'המנגנון עובד חלק לחלוטין.',
    condition: 'excellent',
    priceAgorot: 130_000,
    widthCm: 165,
    depthCm: 205,
    heightCm: 40,
    city: 'הרצליה',
    floor: 5,
    hasElevator: true,
    needsDisassembly: true,
  },
  {
    sellerIndex: 0,
    categorySlug: 'beds-mattresses',
    title: 'מיטת יחיד נוער עם מגירות',
    description: 'מיטת יחיד 90x190 עם שלוש מגירות אחסון. עץ מלא בגוון לבן. מתאימה לחדר ילדים.',
    condition: 'good',
    priceAgorot: 62_000,
    widthCm: 95,
    depthCm: 195,
    heightCm: 45,
    city: 'רמת השרון',
    floor: 0,
    hasElevator: true,
    needsDisassembly: true,
  },

  // --- ארונות ואחסון -------------------------------------------------------
  {
    sellerIndex: 1,
    categorySlug: 'storage',
    brandSlug: 'ikea',
    title: 'ארון הזזה שלוש דלתות עם מראה',
    description:
      'ארון בגדים גדול עם שלוש דלתות הזזה, אחת מהן מראה מלאה. פנים הארון מחולק ' +
      'לתלייה ולמדפים. הדלתות זזות חלק. פירוק והרכבה נדרשים.',
    condition: 'good',
    priceAgorot: 165_000,
    originalPriceAgorot: 380_000,
    widthCm: 240,
    depthCm: 60,
    heightCm: 236,
    city: 'רמת גן',
    floor: 2,
    hasElevator: false,
    needsDisassembly: true,
  },
  {
    sellerIndex: 2,
    categorySlug: 'storage',
    title: 'ארונית נעליים צרה לכניסה',
    description: 'ארונית נעליים בעומק 24 ס״מ בלבד, שלוש דלתות נטייה. מושלמת לכניסה צרה.',
    condition: 'like_new',
    priceAgorot: 34_000,
    widthCm: 100,
    depthCm: 24,
    heightCm: 105,
    city: 'הרצליה',
    floor: 1,
    hasElevator: true,
    needsDisassembly: false,
  },

  // --- שידות וקומודות ------------------------------------------------------
  {
    sellerIndex: 0,
    categorySlug: 'dressers',
    brandSlug: 'shemerat-hazorea',
    title: 'שידת מגירות עץ מלא שש מגירות',
    description:
      'שידה רחבה עם שש מגירות על מסילות עץ מסורתיות. עץ אורן מלא, גימור טבעי. ' +
      'רהיט כבד ואיכותי מהסוג שכבר לא מייצרים.',
    condition: 'good',
    priceAgorot: 88_000,
    widthCm: 120,
    depthCm: 45,
    heightCm: 85,
    city: 'תל אביב-יפו',
    floor: 1,
    hasElevator: false,
    needsDisassembly: false,
  },
  {
    sellerIndex: 1,
    categorySlug: 'dressers',
    title: 'שידת לילה עם מגירה אחת',
    description: 'שידת לילה קטנה בגוון אגוז, מגירה אחת ומדף פתוח. מתאימה גם כשידה עצמאית.',
    condition: 'excellent',
    priceAgorot: 18_000,
    widthCm: 45,
    depthCm: 40,
    heightCm: 55,
    city: 'גבעתיים',
    floor: 3,
    hasElevator: true,
    needsDisassembly: false,
  },

  // --- מדפים וספריות -------------------------------------------------------
  {
    sellerIndex: 2,
    categorySlug: 'shelves',
    brandSlug: 'ikea',
    title: 'ספרייה גבוהה חמישה מדפים',
    description:
      'ספרייה בגובה שני מטר עם חמישה מדפים ניתנים לכוונון. גוון לבן. ' +
      'מחוזקת לקיר, הברגים כלולים.',
    condition: 'good',
    priceAgorot: 42_000,
    widthCm: 80,
    depthCm: 30,
    heightCm: 202,
    city: 'הרצליה',
    floor: 2,
    hasElevator: true,
    needsDisassembly: true,
  },
  {
    sellerIndex: 0,
    categorySlug: 'shelves',
    title: 'מדף קיר צף עץ אלון 120 ס״מ',
    description: 'מדף צף בעובי 4 ס״מ, עץ אלון מלא, ללא תושבות נראות. שני מדפים במחיר.',
    condition: 'like_new',
    priceAgorot: 22_000,
    widthCm: 120,
    depthCm: 22,
    heightCm: 4,
    city: 'תל אביב-יפו',
    floor: 3,
    hasElevator: false,
    needsDisassembly: false,
  },

  // --- תאורה ---------------------------------------------------------------
  {
    sellerIndex: 1,
    categorySlug: 'lighting',
    title: 'מנורת קריאה עומדת פליז',
    description:
      'מנורת רצפה עם זרוע מתכווננת וגוון פליז מוברש. אהיל בד שמנת. ' +
      'נורה כלולה. הכבל באורך שני מטר.',
    condition: 'excellent',
    priceAgorot: 26_000,
    widthCm: 40,
    depthCm: 40,
    heightCm: 180,
    city: 'רמת גן',
    floor: 4,
    hasElevator: true,
    needsDisassembly: false,
  },
  {
    sellerIndex: 2,
    categorySlug: 'lighting',
    title: 'גוף תאורה תלוי ראטן קוטר 50',
    description: 'מנורת תלייה בעבודת יד מראטן טבעי. מפזרת אור חם ויפה. הכבל ניתן לקיצור.',
    condition: 'like_new',
    priceAgorot: 31_000,
    widthCm: 50,
    depthCm: 50,
    heightCm: 45,
    city: 'רעננה',
    floor: 0,
    hasElevator: true,
    needsDisassembly: false,
  },

  // --- שטיחים --------------------------------------------------------------
  {
    sellerIndex: 0,
    categorySlug: 'rugs',
    title: 'שטיח צמר בגוון טבעי 200x300',
    description:
      'שטיח צמר ארוג ביד בגוון שמנת עם קו גיאומטרי עדין. עבר ניקוי יבש מקצועי ' +
      'לפני המכירה. מגיע מגולגל.',
    condition: 'excellent',
    priceAgorot: 78_000,
    originalPriceAgorot: 190_000,
    widthCm: 35,
    depthCm: 35,
    heightCm: 205,
    city: 'תל אביב-יפו',
    floor: 3,
    hasElevator: false,
    needsDisassembly: false,
  },
  {
    sellerIndex: 1,
    categorySlug: 'rugs',
    title: 'שטיח כותנה כחול לחדר ילדים',
    description: 'שטיח כותנה רך 120x180 בפסים כחול-לבן. ניתן לכביסה במכונה. מצב מצוין.',
    condition: 'good',
    priceAgorot: 16_000,
    widthCm: 30,
    depthCm: 30,
    heightCm: 125,
    city: 'גבעתיים',
    floor: 2,
    hasElevator: true,
    needsDisassembly: false,
  },

  // --- ריהוט גן ------------------------------------------------------------
  {
    sellerIndex: 2,
    categorySlug: 'garden',
    title: 'סט ישיבה למרפסת עץ טיק',
    description:
      'שולחן ושני כיסאות מעץ טיק לגינה. העץ עבר שימון בתחילת העונה. ' +
      'עמיד בגשם, נשאר בחוץ כל השנה.',
    condition: 'good',
    priceAgorot: 92_000,
    widthCm: 140,
    depthCm: 80,
    heightCm: 75,
    city: 'רמת השרון',
    floor: 0,
    hasElevator: true,
    needsDisassembly: false,
  },
  {
    sellerIndex: 0,
    categorySlug: 'garden',
    title: 'שני כיסאות נוח מתקפלים',
    description: 'כיסאות נוח מתקפלים עם בד רשת נושם. קלים לאחסון בחורף. מצב טוב מאוד.',
    condition: 'good',
    priceAgorot: 14_000,
    widthCm: 60,
    depthCm: 70,
    heightCm: 100,
    city: 'תל אביב-יפו',
    floor: 3,
    hasElevator: false,
    needsDisassembly: false,
  },

  // --- ריהוט משרדי ---------------------------------------------------------
  {
    sellerIndex: 1,
    categorySlug: 'office',
    brandSlug: 'homecenter',
    title: 'כיסא משרדי ארגונומי עם תמיכה מותנית',
    description:
      'כיסא משרדי עם משענת רשת, תמיכה מותנית מתכווננת ומשענות יד. גלגלים חדשים. ' +
      'ישב עליו אדם אחד בלבד, מהבית.',
    condition: 'excellent',
    priceAgorot: 58_000,
    originalPriceAgorot: 140_000,
    widthCm: 62,
    depthCm: 62,
    heightCm: 115,
    city: 'רמת גן',
    floor: 1,
    hasElevator: true,
    needsDisassembly: false,
  },
  {
    sellerIndex: 2,
    categorySlug: 'office',
    title: 'ארונית משרדית נמוכה עם מנעול',
    description: 'ארונית מתכת בשלוש מגירות עם מנעול מרכזי ומפתח. מתגלגלת, נכנסת מתחת לשולחן.',
    condition: 'good',
    priceAgorot: 24_000,
    widthCm: 40,
    depthCm: 50,
    heightCm: 60,
    city: 'הרצליה',
    floor: 2,
    hasElevator: true,
    needsDisassembly: false,
  },

  // --- שונות ---------------------------------------------------------------
  {
    sellerIndex: 0,
    categorySlug: 'misc',
    title: 'מראה קיר עגולה קוטר 80 מסגרת שחורה',
    description: 'מראה עגולה עם מסגרת מתכת דקה בשחור מט. תלייה קלה, הווים כלולים.',
    condition: 'like_new',
    priceAgorot: 29_000,
    widthCm: 80,
    depthCm: 5,
    heightCm: 80,
    city: 'תל אביב-יפו',
    floor: 3,
    hasElevator: false,
    needsDisassembly: false,
  },
  {
    // The sold item. `sold-200` is a gate stage and it needs one of these.
    sellerIndex: 1,
    categorySlug: 'misc',
    title: 'עגלת הגשה שתי קומות מתכת ועץ',
    description: 'עגלת הגשה על גלגלים, מסגרת מתכת שחורה ומדפי עץ. שימשה כבר מטבח נייד.',
    condition: 'good',
    priceAgorot: 21_000,
    widthCm: 70,
    depthCm: 40,
    heightCm: 80,
    city: 'גבעתיים',
    floor: 1,
    hasElevator: true,
    needsDisassembly: false,
    status: 'sold',
  },
];
