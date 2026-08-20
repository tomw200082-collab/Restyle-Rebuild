export type ListingDraftInput = {
  /** Public URLs of the uploaded photos, in display order. */
  photoUrls: string[];
  categorySlugs: Array<{ slug: string; name_he: string }>;
  brandNames: string[];
};

export type ListingDraft = {
  title_he: string;
  description_he: string;
  category_slug: string | null;
  brand_name: string | null;
  condition: 'like_new' | 'excellent' | 'good' | 'fair' | null;
  width_cm: number | null;
  depth_cm: number | null;
  height_cm: number | null;
  /**
   * Dimensions estimated from photos are guesses. When true the UI marks each
   * dimension field "לאמת" — a wrong dimension is a crew arriving with the
   * wrong van, so this flag is load-bearing rather than cosmetic.
   */
  dimensions_estimated: boolean;
  suggested_price_agorot: number | null;
  original_price_agorot: number | null;
  alt_texts: string[];
  notes_he: string | null;
};

export interface AiListingProvider {
  readonly name: string;
  draftFromPhotos(input: ListingDraftInput): Promise<ListingDraft>;
}
