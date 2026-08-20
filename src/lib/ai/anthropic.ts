import Anthropic from '@anthropic-ai/sdk';
import type { AiListingProvider, ListingDraft, ListingDraftInput } from './types';

type SupportedMedia = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/**
 * Vision-based draft. Activates only when AI_LISTING_ENABLED is true and a key
 * is present; otherwise the mock runs and the wizard is unchanged. [D-27]
 *
 * The model drafts; the seller decides. Every field it returns is editable and
 * nothing is submitted without the seller reviewing it.
 */
export class AnthropicListingProvider implements AiListingProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async draftFromPhotos(input: ListingDraftInput): Promise<ListingDraft> {
    const categoryList = input.categorySlugs.map((c) => `${c.slug} (${c.name_he})`).join(', ');

    const images = await Promise.all(
      input.photoUrls.slice(0, 5).map(async (url) => {
        const res = await fetch(url);
        const buf = Buffer.from(await res.arrayBuffer());
        const header = res.headers.get('content-type') ?? 'image/jpeg';
        const mediaType: SupportedMedia = (
          ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(header)
            ? header
            : 'image/jpeg'
        ) as SupportedMedia;

        return {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: mediaType, data: buf.toString('base64') },
        };
      }),
    );

    const message = await this.client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system:
        'You draft second-hand furniture listings for an Israeli marketplace. ' +
        'All user-facing text must be natural, native Hebrew — never translated-sounding. ' +
        'Be concrete and honest: describe visible wear rather than hiding it, because the ' +
        'platform inspects every item at pickup and a mismatch cancels the sale. ' +
        'Dimensions estimated from a photo are guesses; say so by setting dimensions_estimated. ' +
        'Respond with a single JSON object and nothing else.',
      messages: [
        {
          role: 'user',
          content: [
            ...images,
            {
              type: 'text',
              text:
                `Draft a listing from these photos. Categories: ${categoryList}. ` +
                `Known brands: ${input.brandNames.join(', ')}.\n\n` +
                'Return JSON with exactly these keys: title_he (max 80 chars), ' +
                'description_he (2-4 short paragraphs), category_slug (one of the slugs above ' +
                'or null), brand_name (one of the known brands, or null if not identifiable), ' +
                'condition (like_new|excellent|good|fair), width_cm, depth_cm, height_cm ' +
                '(integers in centimetres, or null), dimensions_estimated (boolean), ' +
                'suggested_price_agorot (integer agorot; second-hand furniture in Israel ' +
                'typically sells for 25-45% of retail), original_price_agorot (integer agorot ' +
                'or null), alt_texts (one short Hebrew alt string per photo), notes_he (null ' +
                'or a short note about anything the seller should verify).',
            },
          ],
        },
      ],
    });

    const text = message.content.find((c) => c.type === 'text');
    if (!text || text.type !== 'text') throw new Error('AI returned no text');

    const json = /\{[\s\S]*\}/.exec(text.text)?.[0];
    if (!json) throw new Error('AI returned no JSON object');

    return JSON.parse(json) as ListingDraft;
  }
}
