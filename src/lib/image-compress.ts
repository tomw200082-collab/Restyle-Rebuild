/**
 * Client-side downscale + re-encode before upload.
 *
 * Sellers photograph furniture on phones, which means 4–12 MB originals. The
 * storage bucket caps at 5 MB per image, and an un-resized upload over mobile
 * data is the most likely place for the sell flow to fail silently.
 */
const MAX_EDGE = 1800;
const QUALITY = 0.82;

export type CompressedImage = { blob: Blob; width: number; height: number };

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return { blob: file, width: bitmap.width, height: bitmap.height };
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', QUALITY),
  );

  return { blob: blob ?? file, width, height };
}
