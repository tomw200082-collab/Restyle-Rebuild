import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { RichText } from '@/components/content/rich-text';
import { BUYER_PROTECTION } from '@/content/marketing';

export const metadata: Metadata = {
  title: 'הגנת קונים',
  description:
    'פריט שגוי, חלק חסר או אי-התאמה לתיאור — 48 שעות מרגע המסירה לפתוח בקשת בירור, והכסף מוחזק אצלנו עד שתאשרו.',
  alternates: { canonical: '/buyer-protection' },
};

export default function BuyerProtectionPage() {
  return (
    <Container className="py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-display-2 text-ink">{BUYER_PROTECTION.heroTitle}</h1>
        <p className="mt-4 text-body-lg text-ink-muted">{BUYER_PROTECTION.heroBody}</p>

        <section className="mt-16">
          <h2 className="font-display text-h1 text-ink">{BUYER_PROTECTION.whenTitle}</h2>
          <p className="mt-3 text-body text-ink-muted">{BUYER_PROTECTION.whenBody}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {BUYER_PROTECTION.cases.map((item) => (
              <div key={item.title} className="rounded-lg border border-line bg-surface p-5">
                <h3 className="text-h3 text-ink">{item.title}</h3>
                <p className="mt-2 text-body-sm text-ink-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-h1 text-ink">{BUYER_PROTECTION.processTitle}</h2>
          <ol className="mt-8 space-y-4">
            {BUYER_PROTECTION.process.map((step, index) => (
              <li key={step.title} className="flex gap-4 rounded-lg bg-sand p-5">
                <span className="font-display text-h2 text-clay tabular">{index + 1}</span>
                <div>
                  <h3 className="text-h3 text-ink">{step.title}</h3>
                  <p className="mt-1 text-body-sm text-ink-muted">
                    <RichText text={step.body} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 rounded-lg bg-clay-soft p-8">
          <h2 className="font-display text-h2 text-ink">{BUYER_PROTECTION.resaleTitle}</h2>
          <p className="mt-3 text-body text-ink-muted">
            <RichText text={BUYER_PROTECTION.resaleBody} />
          </p>
        </section>

        <section className="mt-16">
          <h2 className="font-display text-h1 text-ink">{BUYER_PROTECTION.finalTitle}</h2>
          <p className="mt-3 text-body text-ink-muted">{BUYER_PROTECTION.finalBody}</p>
        </section>

        <section className="mt-16 border-t border-line pt-10">
          <h2 className="font-display text-h2 text-ink">{BUYER_PROTECTION.ctaTitle}</h2>
          <p className="mt-3 text-body text-ink-muted">{BUYER_PROTECTION.ctaBody}</p>
          <Button asChild className="mt-6">
            <Link href={BUYER_PROTECTION.ctaHref}>{BUYER_PROTECTION.ctaLabel}</Link>
          </Button>
        </section>
      </div>
    </Container>
  );
}
