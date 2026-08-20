import sharp from 'sharp';

/**
 * A real, decodable image for upload specs.
 *
 * Generated rather than embedded as base64: a hand-pasted fixture that fails
 * to decode produces a test failure that looks exactly like an application
 * bug, and this suite already lost time to precisely that.
 */
export async function testPhoto(label = 'test'): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 243, g: 237, b: 228 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="800" height="600"><text x="400" y="300" text-anchor="middle"
             font-family="sans-serif" font-size="48" fill="#C4633F">${label}</text></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

export async function testPhotoFiles(count: number) {
  return Promise.all(
    Array.from({ length: count }, async (_, i) => ({
      name: `photo-${i + 1}.png`,
      mimeType: 'image/png',
      buffer: await testPhoto(`photo ${i + 1}`),
    })),
  );
}
