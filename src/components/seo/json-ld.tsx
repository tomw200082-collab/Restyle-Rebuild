import type { JsonLd } from '@/lib/seo/jsonld';

/**
 * Serialises through JSON.stringify and escapes `<`, so a listing title
 * containing `</script>` cannot break out of the block. Never interpolate
 * values into a JSON-LD string by hand.
 */
export function JsonLdScript({ data }: { data: JsonLd | JsonLd[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: json }} />
  );
}
