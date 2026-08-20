import { describe, expect, it } from 'vitest';
import {
  buildSimpleSlug,
  buildSlug,
  slugSuffix,
  suffixFromSlug,
  transliterate,
} from '@/lib/seo/slug';

const ID = 'k3f9a2b1-0000-4000-8000-000000000000'.replace(/[^0-9a-f-]/g, '0');

describe('transliterate', () => {
  it('uses the term dictionary for furniture vocabulary', () => {
    expect(transliterate('ספה תלת מושבית')).toBe('sapa-tlat-moshavit');
    expect(transliterate('שולחן אוכל')).toBe('shulchan-ochel');
    expect(transliterate('מיטה זוגית')).toBe('mita-zugit');
  });

  it('uses the brand dictionary', () => {
    expect(transliterate('איקאה')).toBe('ikea');
    expect(transliterate('ספה איקאה')).toBe('sapa-ikea');
  });

  it('passes Latin brand names through, lowercased', () => {
    expect(transliterate('ספה West Elm')).toBe('sapa-west-elm');
  });

  it('falls back to letter mapping for unknown words', () => {
    // Not in the dictionary; must still produce a stable, URL-safe string.
    const out = transliterate('מקרר');
    expect(out).toMatch(/^[a-z0-9-]+$/);
    expect(out.length).toBeGreaterThan(0);
  });

  it('treats final and base letter forms as the same word', () => {
    // Imported data sometimes carries the base form (לבנ) where Hebrew would
    // normally be written with the final form (לבן). Both must produce the
    // same slug, or the same item imports under two different URLs.
    expect(transliterate('לבן')).toBe(transliterate('לבנ'));
    expect(transliterate('לבן')).toBe('lavan');
    expect(transliterate('ארון')).toBe(transliterate('ארונ'));
  });

  it('strips niqqud', () => {
    expect(transliterate('סַפָּה')).toBe(transliterate('ספה'));
  });

  it('handles the כסא / כיסא spelling split the legacy data contains', () => {
    expect(transliterate('כסא')).toBe(transliterate('כיסא'));
  });

  it('is idempotent on an already-transliterated string', () => {
    const once = transliterate('ספה תלת מושבית איקאה');
    expect(transliterate(once)).toBe(once);
  });

  it('never emits characters outside the URL-safe set', () => {
    expect(transliterate('ספה — "מיוחדת" 3+2 מ״ר!')).toMatch(/^[a-z0-9-]*$/);
  });
});

describe('buildSlug', () => {
  it('appends a 6-character suffix from the id', () => {
    const slug = buildSlug('ספה תלת מושבית איקאה', ID);
    expect(slug.endsWith(`-${slugSuffix(ID)}`)).toBe(true);
    expect(slugSuffix(ID)).toHaveLength(6);
  });

  it('gives two identical titles distinct slugs', () => {
    const a = buildSlug('ספה תלת מושבית', '11111111-1111-4111-8111-111111111111');
    const b = buildSlug('ספה תלת מושבית', '22222222-2222-4222-8222-222222222222');
    expect(a).not.toBe(b);
  });

  it('caps the body at 60 characters on a word boundary', () => {
    const long = 'ספה תלת מושבית מעוצבת מודרנית איקאה בד אפור כהה נפתחת למיטה זוגית גדולה מאוד';
    const slug = buildSlug(long, ID);
    const body = slug.slice(0, slug.lastIndexOf('-'));
    expect(body.length).toBeLessThanOrEqual(60);
    expect(body.endsWith('-')).toBe(false);
  });

  it('still produces a usable slug when the title transliterates to nothing', () => {
    const slug = buildSlug('!!! ???', ID);
    expect(slug).toContain(slugSuffix(ID));
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('suffixFromSlug', () => {
  it('recovers the suffix', () => {
    const slug = buildSlug('שולחן עבודה', ID);
    expect(suffixFromSlug(slug)).toBe(slugSuffix(ID));
  });

  it('returns null when there is no suffix', () => {
    expect(suffixFromSlug('sapa-tlat-moshavit')).toBeNull();
  });
});

describe('buildSimpleSlug', () => {
  it('produces suffix-free slugs for categories and brands', () => {
    expect(buildSimpleSlug('ספות וכורסאות')).toMatch(/^[a-z0-9-]+$/);
    expect(buildSimpleSlug('שולחנות')).toBe('shulchanot');
  });
});
