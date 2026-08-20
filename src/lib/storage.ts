import { env } from '@/lib/env';

export const LISTING_PHOTOS_BUCKET = 'listing-photos';

/** Storage path → public URL. Built rather than fetched, so it is free. */
export function photoUrl(storagePath: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/${LISTING_PHOTOS_BUCKET}/${storagePath}`;
}

/** Cover photo first; falls back to the first available. */
export function coverPhoto<T extends { storage_path: string; sort: number }>(
  photos: T[] | null | undefined,
): T | null {
  if (!photos?.length) return null;
  return [...photos].sort((a, b) => a.sort - b.sort)[0] ?? null;
}
