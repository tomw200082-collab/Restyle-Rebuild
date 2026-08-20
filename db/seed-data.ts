/**
 * Seed data. Deterministic by construction — fixed uuids, no Math.random, no
 * new Date() — because a seed that varies per run makes e2e assertions
 * unwritable.
 */

export type CategorySeed = {
  slug: string;
  name_he: string;
  sort: number;
  intro_he: string;
};

/** Taxonomy from the master prompt, superset of the five values the legacy
 *  catalogue actually used (ספה / שולחן / שידה / כסא / כורסה). */
export const CATEGORIES: CategorySeed[] = [
  {
    slug: 'sofas-armchairs', name_he: 'ספות וכורסאות', sort: 10,
    intro_he:
      'ספות וכורסאות יד שנייה במצב מצוין, מבתים פרטיים בגוש דן. כל פריט נבדק על ידינו לפני הפרסום, והמחיר שאתם רואים הוא המחיר שאתם משלמים. ההובלה מתואמת דרכנו — אתם לא צריכים לגייס חברים ורכב.',
  },
  {
    slug: 'tables', name_he: 'שולחנות', sort: 20,
    intro_he:
      'שולחנות אוכל, שולחנות סלון ושולחנות עבודה יד שנייה. שולחן איכותי הוא הפריט שהכי משתלם לקנות יד שנייה — עץ מלא שומר על עצמו לאורך שנים, והמחיר החדש שלו כמעט תמיד כפול.',
  },
  {
    slug: 'chairs', name_he: 'כיסאות', sort: 30,
    intro_he:
      'כיסאות אוכל, כיסאות משרד וכיסאות בר יד שנייה. אפשר לקנות סט שלם או להשלים כיסאות בודדים לשולחן קיים — כל המידות מופיעות בעמוד הפריט.',
  },
  {
    slug: 'beds-mattresses', name_he: 'מיטות ומזרנים', sort: 40,
    intro_he:
      'מיטות זוגיות, מיטות יחיד ומזרנים יד שנייה. מזרנים מתקבלים אצלנו רק במצב כמו חדש, ואנחנו בודקים אותם פיזית לפני האיסוף.',
  },
  {
    slug: 'storage', name_he: 'ארונות ואחסון', sort: 50,
    intro_he:
      'ארונות בגדים, ארונות אחסון וויטרינות יד שנייה. שימו לב למידות ולשאלת הפירוק — אם הארון דורש פירוק והרכבה זה מופיע בעמוד הפריט ומחושב בעלות ההובלה.',
  },
  {
    slug: 'dressers', name_he: 'שידות וקומודות', sort: 60,
    intro_he:
      'שידות, קומודות ושידות טלוויזיה יד שנייה. פריטי אחסון קטנים הם הדרך המהירה ביותר לשנות חדר בלי לשפץ אותו.',
  },
  {
    slug: 'shelves', name_he: 'מדפים וספריות', sort: 70,
    intro_he:
      'ספריות, כונניות ומדפים יד שנייה בגוש דן. ספרייה טובה נשארת יפה עשרות שנים, וכאן היא עולה שליש ממחיר החנות.',
  },
  {
    slug: 'lighting', name_he: 'תאורה', sort: 80,
    intro_he:
      'מנורות רצפה, מנורות שולחן וגופי תאורה יד שנייה. תאורה היא הפריט שהכי משנה תחושה בחדר ביחס למחיר.',
  },
  {
    slug: 'rugs', name_he: 'שטיחים', sort: 90,
    intro_he:
      'שטיחים יד שנייה במצב טוב ומעלה. כל שטיח מצולם במלואו כדי שתראו את הגוון האמיתי ואת הבלאי, אם יש.',
  },
  {
    slug: 'garden', name_he: 'ריהוט גן', sort: 100,
    intro_he:
      'ריהוט גן ומרפסת יד שנייה — פינות ישיבה, שולחנות חוץ וכיסאות. ריהוט חוץ איכותי עמיד לשנים, וביד שנייה הוא נמכר בשבריר מהמחיר.',
  },
  {
    slug: 'office', name_he: 'ריהוט משרדי', sort: 110,
    intro_he:
      'שולחנות עבודה, כיסאות משרד וארונות תיוק יד שנייה. מתאים גם לפינת עבודה בבית וגם למשרד קטן.',
  },
  {
    slug: 'misc', name_he: 'שונות', sort: 120,
    intro_he:
      'פריטי ריהוט שלא נכנסים לקטגוריה אחרת — מראות, מתלים, פרגודים ועוד.',
  },
];

export const BRANDS = [
  { slug: 'ikea', name: 'איקאה', sort: 10 },
  { slug: 'habitat', name: 'Habitat', sort: 20 },
  { slug: 'id-design', name: 'ID Design', sort: 30 },
  { slug: 'beitili', name: 'ביתילי', sort: 40 },
  { slug: 'shemerat-hazorea', name: 'שמרת הזורע', sort: 50 },
  { slug: 'rahitey-doron', name: 'רהיטי דורון', sort: 60 },
  { slug: 'aminach', name: 'עמינח', sort: 70 },
  { slug: 'silon', name: 'סילון', sort: 80 },
  { slug: 'homecenter', name: 'HomeCenter', sort: 90 },
  { slug: 'boconcept', name: 'BoConcept', sort: 100 },
  { slug: 'west-elm', name: 'West Elm', sort: 110 },
  { slug: 'no-brand', name: 'ללא מותג', sort: 999 },
];

/**
 * Zones and fees from the master prompt. The city list is the legacy service
 * area — 20 Gush Dan municipalities, outside which delivery was refused. [LI 3]
 */
export const DELIVERY_ZONES: Array<{ city: string; zone: 'A' | 'B' | 'C'; fee_agorot: number }> = [
  { city: 'תל אביב-יפו', zone: 'A', fee_agorot: 14900 },
  { city: 'רמת גן', zone: 'A', fee_agorot: 14900 },
  { city: 'גבעתיים', zone: 'A', fee_agorot: 14900 },

  { city: 'חולון', zone: 'B', fee_agorot: 19900 },
  { city: 'בת ים', zone: 'B', fee_agorot: 19900 },
  { city: 'בני ברק', zone: 'B', fee_agorot: 19900 },
  { city: 'הרצליה', zone: 'B', fee_agorot: 19900 },
  { city: 'רמת השרון', zone: 'B', fee_agorot: 19900 },
  { city: 'פתח תקווה', zone: 'B', fee_agorot: 19900 },
  { city: 'ראשון לציון', zone: 'B', fee_agorot: 19900 },

  { city: 'כפר סבא', zone: 'C', fee_agorot: 24900 },
  { city: 'רעננה', zone: 'C', fee_agorot: 24900 },
  { city: 'הוד השרון', zone: 'C', fee_agorot: 24900 },
  { city: 'ראש העין', zone: 'C', fee_agorot: 24900 },
  { city: 'אור יהודה', zone: 'C', fee_agorot: 24900 },
  { city: 'יהוד-מונוסון', zone: 'C', fee_agorot: 24900 },
  { city: 'קריית אונו', zone: 'C', fee_agorot: 24900 },
  { city: 'גני תקווה', zone: 'C', fee_agorot: 24900 },
  { city: 'אזור', zone: 'C', fee_agorot: 24900 },
  { city: 'נס ציונה', zone: 'C', fee_agorot: 24900 },
];

export type UserSeed = {
  id: string;
  email: string;
  password: string;
  full_name: string;
  phone: string;
  city: string;
  role: 'user' | 'admin';
};

/** Fixed ids so Playwright storage states and factory data stay stable. */
export const USERS: UserSeed[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@restyle.test', password: 'restyle-admin-123',
    full_name: 'תום ויט', phone: '053-7252858', city: 'תל אביב-יפו', role: 'admin',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'seller@restyle.test', password: 'restyle-seller-123',
    full_name: 'דנה לוי', phone: '052-1112222', city: 'תל אביב-יפו', role: 'user',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'buyer@restyle.test', password: 'restyle-buyer-123',
    full_name: 'יונתן כהן', phone: '054-3334444', city: 'רמת גן', role: 'user',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    email: 'seller2@restyle.test', password: 'restyle-seller2-123',
    full_name: 'מיכל אברהם', phone: '050-5556666', city: 'גבעתיים', role: 'user',
  },
];

export type ListingSeed = {
  id: string;
  title: string;
  description: string;
  category: string;
  brand?: string;
  condition: 'like_new' | 'excellent' | 'good' | 'fair';
  w: number; d: number; h: number;
  price: number;          // shekels
  original?: number;      // shekels
  city: string;
  street: string;
  floor: number;
  elevator: boolean;
  disassembly?: boolean;
  seller: 'seller' | 'seller2';
  status?: 'active' | 'pending_review' | 'rejected' | 'sold' | 'expired' | 'draft';
  rejection_reason?: string;
};

const id = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

export const LISTINGS: ListingSeed[] = [
  { id: id(1), title: 'ספה תלת מושבית איקאה בד אפור', description: 'ספת KIVIK תלת מושבית מאיקאה, בד אפור כהה. נקנתה לפני שנתיים ושימשה בסלון של זוג ללא ילדים וללא חיות מחמד. הכיסוי כביס ונשלח לניקוי לפני הפרסום. יש סימן שפשוף קל ברגל השמאלית האחורית שלא נראה כשהספה במקומה. מגיעה עם כל הרגליים המקוריות.', category: 'sofas-armchairs', brand: 'ikea', condition: 'excellent', w: 228, d: 95, h: 83, price: 1450, original: 3495, city: 'תל אביב-יפו', street: 'רחוב דיזנגוף 145', floor: 3, elevator: true, seller: 'seller' },
  { id: id(2), title: 'ספה פינתית נפתחת בז בהיר', description: 'ספה פינתית עם מנגנון פתיחה למיטה זוגית ותא אחסון מתחת למושב. בד בז בהיר, נקייה מאוד. שימשה בחדר אורחים ולכן נפתחה בסך הכל כמה פעמים. הפינה ניתנת להרכבה משני הצדדים. דורשת פירוק חלקי להובלה במדרגות.', category: 'sofas-armchairs', condition: 'excellent', w: 265, d: 185, h: 85, price: 2200, original: 5900, city: 'רמת גן', street: 'רחוב ביאליק 22', floor: 4, elevator: false, disassembly: true, seller: 'seller2' },
  { id: id(3), title: 'כורסת קטיפה ירוקה מעוצבת', description: 'כורסה בקטיפה ירוקה עמוקה על רגלי עץ אלון. פריט הצהרה יפהפה שקנינו לפינת קריאה ופשוט לא השתמשנו בו מספיק. הקטיפה ללא כתמים או שחיקה. הרגליים מתברגות ולכן ההובלה פשוטה.', category: 'sofas-armchairs', brand: 'west-elm', condition: 'like_new', w: 78, d: 82, h: 92, price: 1350, original: 3200, city: 'תל אביב-יפו', street: 'שדרות רוטשילד 60', floor: 2, elevator: true, seller: 'seller' },
  { id: id(4), title: 'שולחן אוכל עץ אלון מלא 180 ס"מ', description: 'שולחן אוכל מעץ אלון מלא, לא פורניר. מקום נוח לשישה סועדים ולשמונה בדוחק. יש כמה סימני שימוש על המשטח שמוסיפים לו אופי — צילמתי אותם מקרוב. הרגליים מתפרקות לחלוטין ולכן הוא נכנס בכל מעלית.', category: 'tables', brand: 'shemerat-hazorea', condition: 'good', w: 180, d: 90, h: 75, price: 1800, original: 6500, city: 'גבעתיים', street: 'רחוב כצנלסון 8', floor: 1, elevator: false, disassembly: true, seller: 'seller2' },
  { id: id(5), title: 'שולחן סלון עגול שיש ופליז', description: 'שולחן סלון עגול עם משטח שיש לבן ובסיס פליז. כבד מאוד ולכן יציב לחלוטין. אין שברים או סדקים בשיש. הפליז קיבל פטינה קלה שנראית מצוין.', category: 'tables', condition: 'excellent', w: 90, d: 90, h: 42, price: 1100, original: 2800, city: 'תל אביב-יפו', street: 'רחוב אבן גבירול 30', floor: 5, elevator: true, seller: 'seller' },
  { id: id(6), title: 'שולחן עבודה לבן עם מגירות', description: 'שולחן כתיבה לבן עם שלוש מגירות בצד ימין. שימש כשולחן עבודה מהבית במשך שנה. המשטח נקי ללא שריטות בולטות. מתאים גם לחדר ילדים.', category: 'office', brand: 'ikea', condition: 'good', w: 140, d: 65, h: 74, price: 450, original: 1290, city: 'רמת גן', street: 'רחוב הרצל 55', floor: 2, elevator: true, seller: 'seller2' },
  { id: id(7), title: 'סט 4 כיסאות אוכל עץ טבעי', description: 'ארבעה כיסאות אוכל תואמים מעץ מלא בגוון טבעי, בסגנון סקנדינבי. כולם יציבים לחלוטין וללא חריקות. מושב עץ ללא ריפוד ולכן קל לתחזוקה. נמכרים כסט בלבד.', category: 'chairs', condition: 'good', w: 45, d: 50, h: 82, price: 720, original: 2000, city: 'תל אביב-יפו', street: 'רחוב פרישמן 12', floor: 3, elevator: false, seller: 'seller' },
  { id: id(8), title: 'כיסא משרדי ארגונומי שחור', description: 'כיסא משרדי עם משענת רשת, תמיכה לגב תחתון וגובה מתכוונן. כל המנגנונים עובדים חלק. הגלגלים הוחלפו לפני חצי שנה. מתאים לישיבה ממושכת.', category: 'office', condition: 'excellent', w: 62, d: 62, h: 118, price: 550, original: 1600, city: 'הרצליה', street: 'רחוב סוקולוב 40', floor: 1, elevator: true, seller: 'seller2' },
  { id: id(9), title: 'מיטה זוגית עץ מלא עם ארגז מצעים', description: 'מיטה זוגית 160×200 מעץ מלא עם ארגז מצעים בפתיחה הידראולית. הבסיס והמנגנון במצב מצוין. המזרן לא כלול. מתפרקת לחלוטין להובלה.', category: 'beds-mattresses', brand: 'aminach', condition: 'good', w: 170, d: 210, h: 100, price: 1600, original: 4900, city: 'פתח תקווה', street: 'רחוב ההסתדרות 15', floor: 3, elevator: true, disassembly: true, seller: 'seller' },
  { id: id(10), title: 'מיטת יחיד לבנה עם מגירות', description: 'מיטת יחיד 90×190 בלבן עם שתי מגירות אחסון גדולות. שימשה בחדר ילדים. יש שריטות קלות בצד אחד שצילמתי. מגיעה עם בסיס למזרן.', category: 'beds-mattresses', condition: 'good', w: 96, d: 196, h: 45, price: 600, original: 1800, city: 'רמת גן', street: 'רחוב ז׳בוטינסקי 88', floor: 6, elevator: true, disassembly: true, seller: 'seller2' },
  { id: id(11), title: 'ארון בגדים 3 דלתות עם מראה', description: 'ארון בגדים בשלוש דלתות, אחת מהן עם מראה בגובה מלא. בפנים מוט תלייה ומדפים. הדלתות נסגרות ישר וללא חריקה. פריט גדול — חובה לוודא מידות לפני הזמנה. דורש פירוק והרכבה.', category: 'storage', brand: 'beitili', condition: 'good', w: 150, d: 60, h: 240, price: 1400, original: 4200, city: 'חולון', street: 'רחוב סוקולוב 25', floor: 2, elevator: false, disassembly: true, seller: 'seller' },
  { id: id(12), title: 'ויטרינה זכוכית שחורה מודרנית', description: 'ויטרינת תצוגה עם דלתות זכוכית ומסגרת מתכת שחורה. תאורת LED פנימית שעובדת. מתאימה לכלים או לאוסף. הזכוכית שלמה לחלוטין.', category: 'storage', condition: 'excellent', w: 100, d: 40, h: 180, price: 950, original: 2600, city: 'תל אביב-יפו', street: 'רחוב יהודה הלוי 70', floor: 4, elevator: true, seller: 'seller2' },
  { id: id(13), title: 'שידת מגירות עץ אורן טבעי', description: 'שידה בת חמש מגירות מעץ אורן. המגירות נשלפות חלק על מסילות עץ. גוון טבעי ללא צבע, אפשר לצבוע בקלות. מתאימה לחדר שינה או לכניסה.', category: 'dressers', condition: 'good', w: 80, d: 45, h: 100, price: 480, original: 1400, city: 'גבעתיים', street: 'רחוב סירקין 3', floor: 2, elevator: false, seller: 'seller' },
  { id: id(14), title: 'שידת טלוויזיה לבנה 160 ס"מ', description: 'שידת טלוויזיה לבנה באורך 160 ס״מ עם שתי מגירות ותא פתוח מרכזי לממיר. יש חור מעבר כבלים מאחור. מצב מצוין, שימשה שנה וחצי.', category: 'dressers', brand: 'ikea', condition: 'excellent', w: 160, d: 40, h: 45, price: 550, original: 1190, city: 'רמת גן', street: 'רחוב אבא הלל 12', floor: 8, elevator: true, seller: 'seller2' },
  { id: id(15), title: 'ספרייה גבוהה עץ כהה 5 מדפים', description: 'ספרייה בגובה שני מטרים עם חמישה מדפים בעץ כהה. יציבה מאוד וללא שקיעה במדפים למרות שהיתה עמוסה בספרים. מומלץ לעגן לקיר. מתפרקת להובלה.', category: 'shelves', condition: 'good', w: 90, d: 32, h: 200, price: 620, original: 1900, city: 'תל אביב-יפו', street: 'רחוב ארלוזורוב 18', floor: 3, elevator: true, disassembly: true, seller: 'seller' },
  { id: id(16), title: 'כוננית קוביות 4x4 לבנה', description: 'כוננית KALLAX 4x4 בלבן. שימשה כמחיצה בין סלון לפינת עבודה ולכן שני הצדדים גמורים. יש שני סימני מים קטנים על המדף העליון.', category: 'shelves', brand: 'ikea', condition: 'good', w: 147, d: 39, h: 147, price: 390, original: 899, city: 'בת ים', street: 'רחוב בלפור 9', floor: 1, elevator: false, seller: 'seller2' },
  { id: id(17), title: 'מנורת רצפה קשת פליז', description: 'מנורת רצפה בסגנון קשת עם גוף פליז ובסיס שיש כבד. מגיעה עם נורת LED חדשה. הכבל והמתג במצב מצוין. פריט שמשנה לגמרי פינת ישיבה.', category: 'lighting', condition: 'like_new', w: 180, d: 35, h: 210, price: 780, original: 1900, city: 'תל אביב-יפו', street: 'רחוב שינקין 44', floor: 2, elevator: false, seller: 'seller' },
  { id: id(18), title: 'זוג מנורות שולחן קרמיקה', description: 'שתי מנורות שולחן תואמות עם בסיס קרמיקה בגוון חול ואהיל פשתן. נמכרות כזוג. שתיהן עובדות, הכבלים תקינים ללא סדקים.', category: 'lighting', condition: 'excellent', w: 30, d: 30, h: 55, price: 320, original: 780, city: 'רעננה', street: 'רחוב אחוזה 100', floor: 1, elevator: true, seller: 'seller2' },
  { id: id(19), title: 'שטיח צמר 200x300 בז', description: 'שטיח צמר גדול בגוון בז חם. נוקה ניקוי יבש מקצועי לפני הפרסום ויש לי את הקבלה. יש בלאי קל באזור אחד שצילמתי מקרוב. שטיח כבד ואיכותי.', category: 'rugs', condition: 'good', w: 300, d: 200, h: 2, price: 850, original: 3400, city: 'הרצליה', street: 'רחוב הנדיב 5', floor: 3, elevator: true, seller: 'seller' },
  { id: id(20), title: 'שטיח כותנה כחול לבן 160x230', description: 'שטיח כותנה שטוח בדוגמה גיאומטרית כחול לבן. כביס במכונה, וכבסתי אותו לפני הפרסום. מתאים לחדר ילדים או לסלון. ללא כתמים.', category: 'rugs', condition: 'excellent', w: 230, d: 160, h: 1, price: 420, original: 1100, city: 'גבעתיים', street: 'רחוב ויצמן 14', floor: 4, elevator: true, seller: 'seller2' },
  { id: id(21), title: 'פינת ישיבה לגינה ראטן 4 חלקים', description: 'פינת ישיבה לגינה מראטן סינתטי עמיד — ספה דו מושבית, שתי כורסאות ושולחן. הכריות מגיעות איתה וכובסו. עמדה תחת סככה ולכן הצבע לא דהה.', category: 'garden', condition: 'good', w: 200, d: 75, h: 70, price: 1250, original: 3900, city: 'ראש העין', street: 'רחוב שבזי 20', floor: 0, elevator: false, seller: 'seller' },
  { id: id(22), title: 'שולחן מרפסת מתקפל עץ טיק', description: 'שולחן מרפסת מעץ טיק שמתקפל לאחסון. שומן בשמן טיק בתחילת העונה. מתאים לשניים עד ארבעה. קל מאוד להזזה.', category: 'garden', condition: 'excellent', w: 120, d: 70, h: 74, price: 560, original: 1500, city: 'רמת השרון', street: 'רחוב אוסישקין 7', floor: 0, elevator: false, seller: 'seller2' },
  { id: id(23), title: 'מראה עגולה גדולה מסגרת שחורה', description: 'מראה עגולה בקוטר 80 ס״מ עם מסגרת מתכת שחורה דקה. הזכוכית ללא שריטות או כתמי כספית. מגיעה עם התלייה המקורית.', category: 'misc', condition: 'like_new', w: 80, d: 4, h: 80, price: 380, original: 950, city: 'תל אביב-יפו', street: 'רחוב בוגרשוב 33', floor: 2, elevator: false, seller: 'seller' },
  { id: id(24), title: 'פרגוד עץ 3 כנפיים', description: 'פרגוד מתקפל בשלוש כנפיים מעץ בהיר עם שריג. משמש להפרדת חלל או להסתרת פינת כביסה. הצירים חזקים והוא עומד יציב.', category: 'misc', condition: 'good', w: 150, d: 3, h: 170, price: 340, original: 890, city: 'קריית אונו', street: 'רחוב לוי אשכול 11', floor: 1, elevator: true, seller: 'seller2' },
  { id: id(25), title: 'כורסת מנוחה עם הדום תואם', description: 'כורסת מנוחה מרופדת בבד אפור בהיר עם הדום תואם. נוחה במיוחד לקריאה. הריפוד נקי, ללא כתמים או קרעים. נמכרת עם ההדום.', category: 'sofas-armchairs', brand: 'habitat', condition: 'excellent', w: 85, d: 90, h: 100, price: 980, original: 2600, city: 'פתח תקווה', street: 'רחוב חיים עוזר 4', floor: 5, elevator: true, seller: 'seller' },
  { id: id(26), title: 'שולחן צד עגול שיש קטן', description: 'שולחן צד עגול קטן עם משטח שיש ורגלי מתכת שחורות. מתאים ליד ספה או כשידת לילה. קל להזזה ויציב.', category: 'tables', condition: 'like_new', w: 45, d: 45, h: 55, price: 290, original: 690, city: 'תל אביב-יפו', street: 'רחוב לילנבלום 21', floor: 3, elevator: true, seller: 'seller2' },
  { id: id(27), title: 'סט 2 כיסאות בר מתכת שחורה', description: 'שני כיסאות בר בגובה 75 ס״מ עם מושב עץ ורגלי מתכת שחורה. יציבים, ללא נדנוד. מתאימים לאי מטבח סטנדרטי.', category: 'chairs', condition: 'good', w: 40, d: 40, h: 100, price: 380, original: 990, city: 'רמת גן', street: 'רחוב קריניצי 60', floor: 2, elevator: true, seller: 'seller' },
  { id: id(28), title: 'ארונית אמבטיה עם כיור', description: 'ארונית אמבטיה תלויה עם כיור אינטגרלי ושתי מגירות. הכיור ללא סדקים. הברז לא כלול. דורשת התקנה על ידי אינסטלטור.', category: 'storage', condition: 'good', w: 80, d: 46, h: 55, price: 420, original: 1400, city: 'חולון', street: 'רחוב ההסתדרות 30', floor: 3, elevator: true, seller: 'seller2' },
  { id: id(29), title: 'שולחן קפה עץ ומתכת תעשייתי', description: 'שולחן קפה בסגנון תעשייתי עם משטח עץ ממוחזר ורגלי מתכת שחורה. משטח עבה ויציב עם סימני שימוש שהם חלק מהאופי של הפריט.', category: 'tables', condition: 'good', w: 110, d: 60, h: 40, price: 640, original: 1800, city: 'גבעתיים', street: 'רחוב בורוכוב 17', floor: 1, elevator: false, seller: 'seller' },
  { id: id(30), title: 'כוננית נעליים לכניסה', description: 'כוננית נעליים צרה לכניסה עם שלוש דלתות מתהפכות. מכילה עד 18 זוגות. תופסת מעט מקום בעומק. במצב טוב מאוד.', category: 'storage', brand: 'ikea', condition: 'excellent', w: 100, d: 24, h: 100, price: 350, original: 799, city: 'בני ברק', street: 'רחוב ז׳בוטינסקי 5', floor: 2, elevator: true, seller: 'seller2' },

  // Non-active statuses, so the admin queue and the SEO/sold states have data.
  { id: id(31), title: 'ספה דו מושבית כחולה', description: 'ספה דו מושבית בבד כחול נייבי, קומפקטית ומתאימה לדירה קטנה. הריפוד נקי והמבנה יציב לחלוטין. מחפשת בית חדש אחרי מעבר דירה.', category: 'sofas-armchairs', condition: 'good', w: 160, d: 88, h: 84, price: 890, original: 2400, city: 'תל אביב-יפו', street: 'רחוב המלך ג׳ורג׳ 40', floor: 2, elevator: false, seller: 'seller', status: 'pending_review' },
  { id: id(32), title: 'שולחן אוכל זכוכית 6 סועדים', description: 'שולחן אוכל עם משטח זכוכית מחוסמת ורגלי נירוסטה. מתאים לשישה סועדים. הזכוכית ללא שריטות עמוקות.', category: 'tables', condition: 'excellent', w: 160, d: 90, h: 75, price: 1100, original: 3200, city: 'רמת גן', street: 'רחוב תובל 2', floor: 7, elevator: true, seller: 'seller2', status: 'pending_review' },
  { id: id(33), title: 'ספה ישנה למסירה', description: 'ספה ישנה מאוד עם קרעים בריפוד ומבנה רעוע. מוסרת כמו שהיא ללא אחריות. דורשת ריפוד מחדש מלא.', category: 'sofas-armchairs', condition: 'fair', w: 200, d: 90, h: 80, price: 100, city: 'חולון', street: 'רחוב אילת 8', floor: 1, elevator: false, seller: 'seller', status: 'rejected', rejection_reason: 'התמונות לא מציגות את הקרעים בריפוד שמתוארים בטקסט. אנא צלמו את כל אזורי הפגיעה באור טבעי והעלו מחדש — נשמח לאשר.' },
  { id: id(34), title: 'כיסא נדנדה עץ', description: 'כיסא נדנדה מעץ מלא עם כרית מושב. הצירים תקינים והתנועה חלקה. יש סדק קטן באחת הידיות שמצולם.', category: 'chairs', condition: 'fair', w: 65, d: 90, h: 105, price: 260, city: 'בת ים', street: 'רחוב רוטשילד 3', floor: 2, elevator: false, seller: 'seller2', status: 'rejected', rejection_reason: 'הסדק בידית מחייב תיקון לפני מכירה מטעמי בטיחות. אחרי תיקון נשמח לפרסם — שלחו לנו תמונה של התיקון.' },
  { id: id(35), title: 'שידה עתיקה משופצת', description: 'שידה עתיקה משנות החמישים שעברה שיפוץ מלא — הוסרה הצבע הישן, שוחזר העץ והמגירות תוקנו. פריט ייחודי.', category: 'dressers', condition: 'excellent', w: 90, d: 45, h: 85, price: 1250, original: 3000, city: 'תל אביב-יפו', street: 'רחוב לבונטין 6', floor: 1, elevator: false, seller: 'seller', status: 'sold' },
  { id: id(36), title: 'מנורת תקרה מעוצבת זכוכית', description: 'מנורת תקרה עם גופי זכוכית מפוחת בעבודת יד. מגיעה עם כל חומרי ההתקנה. פריט מרשים לפינת אוכל.', category: 'lighting', condition: 'like_new', w: 60, d: 60, h: 40, price: 890, original: 2200, city: 'הרצליה', street: 'רחוב בן גוריון 12', floor: 3, elevator: true, seller: 'seller2', status: 'sold' },
  { id: id(37), title: 'שולחן עבודה מתכוונן חשמלי', description: 'שולחן עבודה עם מנגנון הגבהה חשמלי לעמידה. המנוע עובד חלק. מגיע עם השלט ועם מסילת כבלים.', category: 'office', condition: 'good', w: 140, d: 70, h: 120, price: 1350, original: 3800, city: 'רעננה', street: 'רחוב הפלמ״ח 9', floor: 2, elevator: true, seller: 'seller', status: 'expired' },
  { id: id(38), title: 'ארון תיוק משרדי 4 מגירות', description: 'ארון תיוק מתכת בארבע מגירות עם מנעול ומפתח. המגירות נשלפות חלק. מתאים למשרד ביתי.', category: 'office', condition: 'good', w: 47, d: 62, h: 132, price: 380, original: 1200, city: 'פתח תקווה', street: 'רחוב רוטשילד 44', floor: 1, elevator: true, seller: 'seller2', status: 'expired' },
  { id: id(39), title: 'טיוטה — ספה שלא פורסמה', description: 'טיוטה שנשמרה ולא נשלחה לאישור. משמשת לבדיקת מצב draft בממשק המוכר.', category: 'sofas-armchairs', condition: 'good', w: 180, d: 85, h: 80, price: 700, city: 'תל אביב-יפו', street: 'רחוב אלנבי 90', floor: 3, elevator: false, seller: 'seller', status: 'draft' },
  { id: id(40), title: 'טיוטה — שולחן שלא פורסם', description: 'טיוטה שנייה לבדיקת רשימת הטיוטות בממשק המוכר. לא מופיעה בקטלוג הציבורי.', category: 'tables', condition: 'good', w: 120, d: 60, h: 74, price: 520, city: 'גבעתיים', street: 'רחוב כצנלסון 40', floor: 2, elevator: true, seller: 'seller2', status: 'draft' },
];
