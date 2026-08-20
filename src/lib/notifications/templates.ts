import { CONTACT } from '@/lib/env';

export type TemplateName =
  | 'listing_approved'
  | 'listing_rejected'
  | 'seller_purchase_request'
  | 'seller_confirm_reminder'
  | 'buyer_order_received'
  | 'buyer_order_confirmed'
  | 'delivery_scheduled'
  | 'buyer_delivered'
  | 'order_cancelled_refund'
  | 'seller_timeout_cancelled'
  | 'seller_listings_paused'
  | 'seller_listings_unpaused'
  | 'payout_paid'
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_declined'
  | 'dispute_received'
  | 'dispute_resolved';

export type TemplateData = Record<string, string | number | undefined>;

export type RenderedEmail = { subject: string; text: string; html: string };

const FOOTER_TEXT =
  'המוצר הזה נרכש דרך Restyle — מרקטפלייס רהיטים אמין, שקוף ונעים.\n' +
  `לשאלות או תמיכה: ${CONTACT.supportEmail}`;

const fill = (template: string, data: TemplateData) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(data[key] ?? ''));

/**
 * Hebrew email copy. Subjects are reused verbatim from the legacy platform
 * where one existed — customers have already seen that wording. Bodies are
 * rewritten where the legacy text would now be false: the old flow took no
 * money up front, so "לא חויבת ולא נגבה ממך כסף" cannot be sent by a platform
 * that charges at checkout. [LI 7.7], `docs/COPY.md` §11
 */
const TEMPLATES: Record<TemplateName, { subject: string; body: string }> = {
  listing_approved: {
    subject: 'הפריט שלך אושר ומפורסם',
    body:
      'הפריט "{item}" אושר והוא מפורסם עכשיו באתר.\n\n' +
      'נעדכן אותך ברגע שיהיה קונה מעוניין.\n\n{url}',
  },
  listing_rejected: {
    subject: 'נדרש תיקון קטן לפני פרסום',
    body:
      'עברנו על "{item}" ונדרש תיקון קטן כדי לפרסם אותו:\n\n{reason}\n\n' +
      'אפשר לתקן ולשלוח שוב — זה לוקח דקה.\n\n{url}',
  },
  seller_purchase_request: {
    subject: 'יש קונה ששילם על {item} — נדרש אישור',
    body:
      'יש קונה שכבר שילם על "{item}" 🎉\n\n' +
      'הכסף מוחזק אצלנו. כל מה שנדרש ממך: לאשר את המכירה ולבחור מועדי איסוף.\n\n' +
      'יש לך {hours} שעות לאשר. אם לא נשמע ממך, ההזמנה תבוטל והכסף יוחזר לקונה.\n\n{url}',
  },
  seller_confirm_reminder: {
    subject: 'תזכורת: יש קונה שממתין לאישור שלך',
    body:
      'קונה שילם על "{item}" וממתין לאישור שלך.\n\n' +
      'נשארו בערך {hours_left} שעות. אישור לוקח פחות מדקה.\n\n{url}',
  },
  buyer_order_received: {
    subject: 'קיבלנו את ההזמנה — ממתינים לאישור המוכר',
    body:
      'קיבלנו את ההזמנה שלך ואת התשלום.\n\n' +
      'שלחנו למוכר בקשת אישור — יש לו {hours} שעות לאשר.\n' +
      'אם המוכר לא יאשר בזמן, ההזמנה תבוטל והכסף יוחזר לך אוטומטית במלואו.\n\n{url}',
  },
  buyer_order_confirmed: {
    subject: 'המוכר אישר — מתאמים הובלה',
    body:
      'המוכר אישר את המכירה של "{item}".\n\n' +
      'עכשיו אנחנו מתאמים את ההובלה ונעדכן אותך במועד המדויק.\n\n{url}',
  },
  delivery_scheduled: {
    subject: 'מועד ההובלה נקבע',
    body:
      'ההובלה של "{item}" נקבעה ל-{date}, {shift}.\n\n' +
      'חשוב להיות זמינים בטלפון בחלון הזמנים שנקבע.\n\n{url}',
  },
  buyer_delivered: {
    subject: 'הרהיט הגיע – תתחדשו',
    body:
      'הרהיט הגיע – תתחדשו!\n\n' +
      'יש לכם {hours} שעות לוודא שהכל תקין. אחרי זה נעביר את התשלום למוכר.\n\n' +
      'אם משהו לא כמו שתואר, אפשר לפתוח בקשת בירור מדף ההזמנה.\n\n{url}',
  },
  order_cancelled_refund: {
    subject: 'ההזמנה בוטלה – הזיכוי בדרך',
    body:
      'ההזמנה על "{item}" בוטלה.\n\n' +
      'הזיכוי בדרך אליך ויופיע באמצעי התשלום בימים הקרובים.\n\n{url}',
  },
  seller_timeout_cancelled: {
    subject: 'הבקשה בוטלה אוטומטית',
    body:
      'לא קיבלנו ממך תגובה בזמן, ולכן ההזמנה על "{item}" בוטלה והכסף הוחזר לקונה.\n\n' +
      'הפריט לא נמחק — הוא חזר להיות פעיל ואפשר לקבל עליו הזמנות חדשות.\n\n{url}',
  },
  seller_listings_paused: {
    subject: 'השהינו את הפריטים שלך — שנחזיר אותם?',
    body:
      'לא קיבלנו ממך תגובה על {count} הזמנות ברצף, ולכן השהינו זמנית את הפריטים ' +
      'הפעילים שלך כדי שקונים לא ימתינו לשווא.\n\n' +
      'שום דבר לא נמחק. ברגע שתאשר לנו שאתה זמין, נחזיר הכל לאוויר.\n\n{url}',
  },
  seller_listings_unpaused: {
    subject: 'הפריטים שלך חזרו לאוויר',
    body:
      'הפריטים שלך פעילים שוב ומופיעים בקטלוג.\n\n' +
      'תודה — תגובה מהירה לבקשות רכישה היא מה שגורם למכירה להיסגר.\n\n{url}',
  },
  payout_paid: {
    subject: 'הכסף מהמכירה בדרך אליך',
    body:
      'העסקה על "{item}" הושלמה והעברנו לך {amount}.\n\n' +
      'הסכום יופיע בחשבון הבנק שלך בימים הקרובים.\n\n{url}',
  },
  offer_received: {
    subject: 'קיבלת הצעה על {item}',
    body:
      'קיבלת הצעה של {amount} על "{item}" (המחיר המבוקש: {price}).\n\n' +
      'אפשר לאשר, לדחות או להציע מחיר אחר. להצעה יש {hours} שעות.\n\n{url}',
  },
  offer_accepted: {
    subject: 'ההצעה שלך התקבלה',
    body:
      'המוכר אישר את ההצעה שלך על "{item}" במחיר {amount}.\n\n' +
      'יש לך {hours} שעות להשלים את הרכישה במחיר שסוכם.\n' +
      'שימו לב: הפריט נשאר זמין לרכישה במחיר המלא עד שתשלימו את הרכישה.\n\n{url}',
  },
  offer_declined: {
    subject: 'ההצעה שלך נדחתה',
    body:
      'המוכר דחה את ההצעה על "{item}".\n\n' +
      'הפריט עדיין זמין לרכישה במחיר המבוקש.\n\n{url}',
  },
  dispute_received: {
    subject: 'קיבלנו את בקשת הבירור שלך',
    body:
      'קיבלנו את בקשת הבירור על "{item}".\n\n' +
      'התשלום למוכר מוקפא עד לסיום הבדיקה. נחזור אליך עם החלטה תוך 3-5 ימי עסקים.\n\n{url}',
  },
  dispute_resolved: {
    subject: 'בקשת הבירור שלך טופלה',
    body: 'בקשת הבירור על "{item}" טופלה.\n\n{resolution}\n\n{url}',
  },
};

export function renderEmail(template: TemplateName, data: TemplateData): RenderedEmail {
  const entry = TEMPLATES[template];
  const subject = fill(entry.subject, data);
  const body = fill(entry.body, data);
  const text = `${body}\n\n—\n${FOOTER_TEXT}`;

  // dir="rtl" on the wrapper, and escaped interpolation — email clients render
  // this as HTML, so an unescaped item title is an injection point.
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;padding:24px;background:#FAF7F2;font-family:Heebo,Arial,sans-serif;color:#22201D;line-height:1.65">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5DCCF;border-radius:14px;padding:28px">
<div style="font-family:Georgia,serif;font-size:22px;margin-bottom:20px">Restyle</div>
${escape(body)
  .split('\n\n')
  .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
  .join('')}
<hr style="border:0;border-top:1px solid #E5DCCF;margin:24px 0">
<p style="margin:0;font-size:13px;color:#6B645C">${escape(FOOTER_TEXT).replace(/\n/g, '<br>')}</p>
</div></body></html>`;

  return { subject, text, html };
}
