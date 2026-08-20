import 'server-only';

import { env } from '@/lib/env';
import { MockAiListingProvider } from './mock';
import { AnthropicListingProvider } from './anthropic';
import type { AiListingProvider } from './types';

export type { AiListingProvider, ListingDraft, ListingDraftInput } from './types';

/**
 * Mock is the default. The real provider activates only when explicitly
 * enabled AND a key is present, so a fresh clone runs the full sell flow with
 * no credentials.
 */
export function getAiListingProvider(): AiListingProvider {
  if (env.aiListingEnabled && env.anthropicApiKey) {
    return new AnthropicListingProvider(env.anthropicApiKey);
  }
  return new MockAiListingProvider();
}
