import type { Metadata } from 'next';
import { LegalPage } from '@/components/content/legal-page';
import { LEGAL_DOCUMENTS } from '@/content/legal';

export const metadata: Metadata = {
  title: 'תקנון ותנאי שימוש',
  description: 'התקנון המלא של Restyle — תנאי השימוש בפלטפורמה, תהליך ההזמנה והתשלום, מדיניות הביטולים והאחריות.',
  alternates: { canonical: '/terms' },
};

export default function Page() {
  return <LegalPage document={LEGAL_DOCUMENTS.terms} />;
}
