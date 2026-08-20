import type { Metadata } from 'next';
import { Container } from '@/components/layout/container';
import { HowItWorksTabs } from '@/components/content/how-it-works-tabs';
import { JsonLdScript } from '@/components/seo/json-ld';
import { HOW_IT_WORKS } from '@/content/marketing';

export const metadata: Metadata = {
  title: 'איך זה עובד',
  description:
    'מפרסמים חינם, אנחנו מביאים קונה, אוספים מהבית ומעבירים את הכסף אחרי המסירה. איך Restyle עובדת, למוכרים ולקונים.',
  alternates: { canonical: '/how-it-works' },
};

/**
 * The FAQ is emitted as structured data from both tracks at once. The visible
 * page shows one track at a time, but a crawler should see every question —
 * they are all on this URL, and hiding half behind a client-side tab would
 * mean indexing half the page's actual content.
 */
function faqJsonLd() {
  const entries = [...HOW_IT_WORKS.seller.faq, ...HOW_IT_WORKS.buyer.faq];

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a.replace(/\*\*/g, '') },
    })),
  };
}

export default function HowItWorksPage() {
  return (
    <Container className="py-12">
      <JsonLdScript data={faqJsonLd()} />
      <HowItWorksTabs initial="seller" />
    </Container>
  );
}
