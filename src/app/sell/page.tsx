import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { FeeCalculator } from '@/components/sell/fee-calculator';
import { getSiteConfig } from '@/lib/pricing/config';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'מכירת רהיטים יד שנייה — פרסום חינם',
  description:
    'מפרסמים חינם, אנחנו מביאים קונה ואוספים מהבית. התשלום מועבר אליכם אחרי המסירה.',
  alternates: { canonical: '/sell' },
};

const STEPS = [
  {
    title: 'צלמו ופרסמו',
    body: 'העלאה של 3 תמונות ומילוי פרטים — בערך חמש דקות. הפרסום חינם תמיד.',
  },
  {
    title: 'אנחנו מביאים קונה',
    body: 'בלי טלפונים מציקים ובלי מיקוח מתיש. הקונה משלם באתר לפני שאתם עושים משהו.',
  },
  {
    title: 'אתם מאשרים',
    body: 'מקבלים הודעה שיש קונה ששילם, מאשרים ובוחרים מועדי איסוף שנוחים לכם.',
  },
  {
    title: 'מקבלים את הכסף',
    body: 'צוות שלנו אוסף מהבית ומוסר לקונה. אחרי 48 שעות הכסף עובר אליכם.',
  },
];

export default async function SellLandingPage() {
  const config = await getSiteConfig();

  return (
    <>
      <section className="border-b border-line bg-sand/30">
        <Container className="py-16 md:py-24">
          <div className="max-w-2xl">
            <h1 className="font-display text-display-2 text-ink">
              מוכרים רהיט? אנחנו עושים את החלק הקשה
            </h1>
            <p className="mt-5 text-body-lg text-ink-muted">
              אתם מצלמים ומפרסמים. אנחנו מביאים קונה, אוספים מהבית, ומעבירים לכם את הכסף.
            </p>
            <div className="mt-8">
              <Button asChild size="lg">
                <Link href="/sell/new">פרסום פריט — חינם</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-16">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-h2 text-ink">איך זה עובד</h2>
            <ol className="mt-8 space-y-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="font-display text-h3 text-clay tabular">{i + 1}</span>
                  <div>
                    <h3 className="text-h3 text-ink">{step.title}</h3>
                    <p className="mt-1 text-body text-ink-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <FeeCalculator commissionPct={config.commission_pct} />

            <div className="mt-8 rounded-lg border border-line bg-surface p-6">
              <h3 className="text-h3 text-ink">מה שחשוב לדעת</h3>
              <ul className="mt-4 space-y-2 text-body-sm text-ink-muted">
                <li>הפרסום חינם. העמלה נגבית רק כשהפריט נמכר.</li>
                <li>הכתובת המדויקת שלכם פרטית — באתר מוצגת רק העיר.</li>
                <li>כל פריט עובר אישור שלנו לפני שהוא מתפרסם.</li>
                <li>אחרי שקונה משלם, יש לכם 48 שעות לאשר את המכירה.</li>
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}
