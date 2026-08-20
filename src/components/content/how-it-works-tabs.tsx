'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { RichText } from '@/components/content/rich-text';
import { HOW_IT_WORKS } from '@/content/marketing';

type Audience = 'seller' | 'buyer';

export function HowItWorksTabs({ initial }: { initial: Audience }) {
  const [audience, setAudience] = useState<Audience>(initial);
  const copy = HOW_IT_WORKS[audience];

  return (
    <>
      <div
        role="tablist"
        aria-label="בחירת נקודת מבט"
        className="mx-auto mt-8 flex w-fit gap-1 rounded-md border border-line bg-surface p-1"
      >
        {(['seller', 'buyer'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={audience === value}
            onClick={() => setAudience(value)}
            className={
              audience === value
                ? 'rounded-sm bg-clay px-5 py-2 text-body-sm text-white'
                : 'rounded-sm px-5 py-2 text-body-sm text-ink-muted transition-colors hover:bg-sand'
            }
          >
            {value === 'seller' ? 'אני רוצה למכור' : 'אני רוצה לקנות'}
          </button>
        ))}
      </div>

      <section className="mt-12 text-center">
        <h1 className="font-display text-display-2 text-ink">{copy.heroTitle}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-body-lg text-ink-muted">{copy.heroBody}</p>
        <Button asChild size="lg" className="mt-8">
          <Link href={copy.heroHref}>{copy.heroCta}</Link>
        </Button>
      </section>

      <section className="mt-20">
        <h2 className="text-center font-display text-h1 text-ink">{copy.stepsTitle}</h2>
        <p className="mt-3 text-center text-body text-ink-muted">{copy.stepsBody}</p>

        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {copy.steps.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-line bg-surface p-6">
              <span className="font-display text-h2 text-clay tabular">{index + 1}</span>
              <h3 className="mt-3 text-h3 text-ink">{step.title}</h3>
              <p className="mt-2 text-body-sm text-ink-muted">
                <RichText text={step.body} />
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20">
        <h2 className="text-center font-display text-h1 text-ink">{copy.whyTitle}</h2>
        <p className="mt-3 text-center text-body text-ink-muted">{copy.whyBody}</p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {copy.why.map((item) => (
            <div key={item.title} className="rounded-lg bg-sand p-6">
              <h3 className="text-h3 text-ink">{item.title}</h3>
              <p className="mt-2 text-body-sm text-ink-muted">
                <RichText text={item.body} />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20">
        <h2 className="font-display text-h1 text-ink">שאלות נפוצות</h2>
        <dl className="mt-8 space-y-4">
          {copy.faq.map((item) => (
            <div key={item.q} className="rounded-lg border border-line bg-surface p-6">
              <dt className="text-h3 text-ink">{item.q}</dt>
              <dd className="mt-2 text-body text-ink-muted">
                <RichText text={item.a} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-20 rounded-lg bg-clay-soft px-6 py-14 text-center">
        <h2 className="font-display text-h1 text-ink">{copy.ctaTitle}</h2>
        <p className="mt-3 text-body-lg text-ink-muted">{copy.ctaBody}</p>
        <Button asChild size="lg" className="mt-8">
          <Link href={copy.ctaHref}>{copy.ctaLabel}</Link>
        </Button>
        <p className="mt-4 text-body-sm text-ink-subtle">{copy.ctaNote}</p>
      </section>

      <p className="mt-12 text-center text-body text-ink-muted">{HOW_IT_WORKS.shared}</p>
    </>
  );
}
