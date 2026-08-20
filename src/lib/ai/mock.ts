import type { AiListingProvider, ListingDraft, ListingDraftInput } from './types';

/**
 * Deterministic fixture provider. The default, so the whole sell flow is
 * testable end to end with no API key and no network. [D-27]
 */
export class MockAiListingProvider implements AiListingProvider {
  readonly name = 'mock';

  async draftFromPhotos(input: ListingDraftInput): Promise<ListingDraft> {
    const category =
      input.categorySlugs.find((c) => c.slug === 'sofas-armchairs') ?? input.categorySlugs[0] ?? null;

    return {
      title_he: 'ספה תלת מושבית בד אפור',
      description_he:
        'ספה תלת מושבית בבד אפור, במצב טוב מאוד. שימשה בסלון של דירה ללא ילדים וללא חיות מחמד. ' +
        'הריפוד נקי וללא קרעים. הרגליים מתברגות ולכן ההובלה פשוטה.\n\n' +
        'זו טיוטה שנוצרה אוטומטית — עברו על כל השדות ותקנו מה שצריך.',
      category_slug: category?.slug ?? null,
      brand_name: null,
      condition: 'good',
      width_cm: 210,
      depth_cm: 90,
      height_cm: 82,
      dimensions_estimated: true,
      suggested_price_agorot: 120_000,
      original_price_agorot: 349_500,
      alt_texts: input.photoUrls.map((_, i) => `ספה תלת מושבית בד אפור — תמונה ${i + 1}`),
      notes_he: null,
    };
  }
}
