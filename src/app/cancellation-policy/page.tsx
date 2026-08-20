import type { Metadata } from 'next';
import { LegalPage } from '@/components/content/legal-page';
import { LEGAL_DOCUMENTS } from '@/content/legal';

export const metadata: Metadata = {
  title: 'מדיניות ביטולים',
  description: 'מתי אפשר לבטל הזמנה ב-Restyle, מה העלות אחרי אישור המוכר, ומה קורה אחרי המסירה.',
  alternates: { canonical: '/cancellation-policy' },
};

export default function Page() {
  return <LegalPage document={LEGAL_DOCUMENTS.cancellation} />;
}
