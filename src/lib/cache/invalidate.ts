import 'server-only';

import { revalidateTag, updateTag } from 'next/cache';
import { tagsForMutation, type MutationKind } from './tags';

type Context = {
  listingId?: string;
  categorySlug?: string;
  brandSlug?: string;
  city?: string;
};

/**
 * Cache invalidation, in one place.
 *
 * Next 16 splits this into two functions with different guarantees, and using
 * the wrong one is a silent staleness bug:
 *
 *   updateTag(tag)               — Server Actions only. Expires immediately,
 *                                  giving read-your-own-writes, so a seller
 *                                  who edits a price sees the new one.
 *   revalidateTag(tag, profile)  — everywhere else (route handlers, webhooks,
 *                                  cron). Marks the tag stale for the next
 *                                  request.
 *
 * Callers say what happened; this module decides which tags and which
 * mechanism. A missed invalidation is then a visible omission in the tag map
 * rather than a stale page nobody notices. [D-46]
 */

export function invalidateFromAction(kind: MutationKind, ctx: Context = {}): void {
  for (const tag of tagsForMutation(kind, ctx)) updateTag(tag);
}

export function invalidateFromRoute(kind: MutationKind, ctx: Context = {}): void {
  for (const tag of tagsForMutation(kind, ctx)) revalidateTag(tag, 'max');
}
