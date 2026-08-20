/**
 * Hebrew → Latin slug generation.
 *
 * Format: <transliterated-title>-<6-char-id-suffix>
 *   "ספה תלת מושבית איקאה"  ->  sapa-tlat-moshavit-ikea-k3f9a2
 *
 * The suffix makes collisions impossible by construction — two sellers listing
 * the same sofa on the same day is the expected case — and the slug is
 * generated once and never regenerated, because the URL is the SEO asset. [D-24]
 *
 * Transliteration is three-stage: term dictionary, brand dictionary, then a
 * deterministic letter-level fallback. Pure letter mapping of unvocalised
 * Hebrew is unreadable (ס־פ־ה -> "sph"), so the dictionaries are what make the
 * URL a ranking asset. Fallback quality never affects correctness.
 */

/** Furniture vocabulary — the words that carry the search intent. */
const TERMS: Record<string, string> = {
  // seating
  ספה: 'sapa', ספת: 'sapat', ספות: 'sapot', כורסה: 'kursa', כורסא: 'kursa',
  כורסאות: 'kursaot', כיסא: 'kise', כסא: 'kise', כיסאות: 'kisaot', כסאות: 'kisaot',
  שרפרף: 'shrafraf', הדום: 'hadom', ספסל: 'safsal',
  // tables
  שולחן: 'shulchan', שולחנות: 'shulchanot', שולחנן: 'shulchan',
  // storage
  ארון: 'aron', ארונות: 'aronot', שידה: 'shida', שידות: 'shidot',
  קומודה: 'komoda', מדף: 'madaf', מדפים: 'madafim', כוננית: 'konenit',
  ספרייה: 'sifria', ספריה: 'sifria', ויטרינה: 'vitrina',
  // bedroom
  מיטה: 'mita', מיטות: 'mitot', מזרן: 'mizran', מזרון: 'mizran',
  מזרנים: 'mizranim', ארונית: 'aronit',
  // lighting, textiles, outdoor
  מנורה: 'menora', מנורת: 'menorat', תאורה: 'teura', אהיל: 'ahil',
  שטיח: 'shatiach', שטיחים: 'shtichim', וילון: 'vilon',
  גן: 'gan', מרפסת: 'mirpeset', חוץ: 'chutz',
  // qualifiers
  תלת: 'tlat', דו: 'du', מושבית: 'moshavit', מושבים: 'moshavim', מושבי: 'moshavi',
  פינתית: 'pinatit', פינתי: 'pinati', פינת: 'pinat', נפתחת: 'niftachat',
  נפתח: 'niftach', מתקפלת: 'mitkapelet', מתקפל: 'mitkapel',
  זוגית: 'zugit', יחיד: 'yachid', יחידה: 'yechida', כפולה: 'kfula',
  אוכל: 'ochel', סלון: 'salon', עבודה: 'avoda', כתיבה: 'ktiva',
  מטבח: 'mitbach', ילדים: 'yeladim', משרדי: 'misradi', משרד: 'misrad',
  קפה: 'kafe', צד: 'tzad', טלוויזיה: 'televizia', אמבטיה: 'ambatia',
  // materials and colours
  עץ: 'etz', מלא: 'male', אלון: 'alon', אורן: 'oren', מתכת: 'matechet',
  זכוכית: 'zchuchit', בד: 'bad', עור: 'or', קטיפה: 'ktifa', ראטן: 'ratan',
  שחור: 'shachor', לבן: 'lavan', אפור: 'afor', בז: 'bezh', חום: 'chum',
  כחול: 'kachol', ירוק: 'yarok', טבעי: 'tivi', כהה: 'kehe', בהיר: 'bahir',
  // condition and style
  חדש: 'chadash', חדשה: 'chadasha', כמו: 'kmo', מצוין: 'metzuyan',
  מעוצב: 'meutzav', מעוצבת: 'meutzevet', קלאסי: 'klasi', קלאסית: 'klasit',
  מודרני: 'moderni', מודרנית: 'modernit', וינטג: 'vintage', סקנדינבי: 'skandinavi',
  יד: 'yad', שנייה: 'shniya', שניה: 'shniya', גדול: 'gadol', גדולה: 'gdola',
  קטן: 'katan', קטנה: 'ktana',
};

/** Brands. Latin names pass through the fallback lowercased. */
const BRANDS: Record<string, string> = {
  איקאה: 'ikea', ביתילי: 'beitili', הביטאט: 'habitat',
  עמינח: 'aminach', סילון: 'silon', דורון: 'doron',
  שמרת: 'shemerat', הזורע: 'hazorea',
};

/** Final forms fold to their base letter before letter-level mapping. */
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/**
 * The reverse, used to normalise a word *before* the dictionary lookup.
 * Hebrew is normally written with final forms, so the dictionary keys use
 * them — but imported or hand-typed data sometimes carries the base form
 * (לבנ instead of לבן). Normalising first means both spellings hit
 * the same dictionary entry and produce the same slug.
 */
const TO_FINAL: Record<string, string> = { כ: 'ך', מ: 'ם', נ: 'ן', פ: 'ף', צ: 'ץ' };

function normaliseFinalForm(word: string): string {
  const last = word.at(-1);
  if (!last) return word;
  const final = TO_FINAL[last];
  return final ? word.slice(0, -1) + final : word;
}

const LETTERS: Record<string, string> = {
  א: 'a', ב: 'b', ג: 'g', ד: 'd', ה: 'h', ו: 'o', ז: 'z', ח: 'ch',
  ט: 't', י: 'i', כ: 'k', ל: 'l', מ: 'm', נ: 'n', ס: 's', ע: 'a',
  פ: 'p', צ: 'tz', ק: 'k', ר: 'r', ש: 'sh', ת: 't',
};

const NIQQUD = /[֑-ׇ]/g;

function transliterateWord(word: string): string {
  const bare = word.replace(NIQQUD, '').replace(/["'׳״]/g, '');
  if (!bare) return '';

  const key = normaliseFinalForm(bare);

  const term = TERMS[key] ?? TERMS[bare];
  if (term) return term;

  const brand = BRANDS[key] ?? BRANDS[bare];
  if (brand) return brand;

  // Latin and digits pass through.
  if (/^[a-zA-Z0-9-]+$/.test(bare)) return bare.toLowerCase();

  let out = '';
  for (const raw of bare) {
    const ch = FINALS[raw] ?? raw;
    const mapped = LETTERS[ch];
    if (mapped !== undefined) {
      out += mapped;
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    }
  }
  return out;
}

/** Hebrew (or mixed) text → a Latin slug body. No id suffix. */
export function transliterate(text: string): string {
  return text
    .split(/[\s ]+/)
    .map(transliterateWord)
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

const MAX_BODY = 60;

function capAtWordBoundary(body: string, max: number): string {
  if (body.length <= max) return body;
  const cut = body.slice(0, max);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > max * 0.5 ? cut.slice(0, lastDash) : cut).replace(/-$/, '');
}

/**
 * The 6-char suffix is taken from the listing uuid, so it is deterministic,
 * stable for the item's lifetime, and collision-free without a retry loop.
 */
export function slugSuffix(id: string): string {
  const hex = id.replace(/-/g, '');
  return hex.slice(0, 6).toLowerCase();
}

export function buildSlug(title: string, id: string): string {
  const body = capAtWordBoundary(transliterate(title), MAX_BODY);
  const suffix = slugSuffix(id);
  return body ? `${body}-${suffix}` : `pariṭ-${suffix}`.normalize('NFKD').replace(/[^\w-]/g, '');
}

/** The id suffix from a slug, for router lookups. */
export function suffixFromSlug(slug: string): string | null {
  const match = /-([0-9a-f]{6})$/.exec(slug);
  return match?.[1] ?? null;
}

/** Category and brand slugs carry no suffix — they are unique by name. */
export function buildSimpleSlug(name: string): string {
  return capAtWordBoundary(transliterate(name), MAX_BODY);
}
