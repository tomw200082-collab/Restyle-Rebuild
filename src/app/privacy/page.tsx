import type { Metadata } from 'next';
import { LegalPage } from '@/components/content/legal-page';
import { LEGAL_DOCUMENTS } from '@/content/legal';

export const metadata: Metadata = {
  title: 'מדיניות פרטיות',
  description: 'איך Restyle אוספת, שומרת ומגנה על המידע האישי שלכם, ואילו נתונים מועברים לצדדים שלישיים.',
  alternates: { canonical: '/privacy' },
};

export default function Page() {
  return <LegalPage document={LEGAL_DOCUMENTS.privacy} />;
}
