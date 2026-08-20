import type { Metadata } from 'next';
import { LegalPage } from '@/components/content/legal-page';
import { LEGAL_DOCUMENTS } from '@/content/legal';

export const metadata: Metadata = {
  title: 'הצהרת נגישות',
  description: 'הצהרת הנגישות של Restyle — רמת ההתאמה, המגבלות הידועות ופרטי רכז הנגישות.',
  alternates: { canonical: '/accessibility' },
};

export default function Page() {
  return <LegalPage document={LEGAL_DOCUMENTS.accessibility} />;
}
