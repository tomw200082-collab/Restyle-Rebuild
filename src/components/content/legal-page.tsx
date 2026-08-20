import { Container } from '@/components/layout/container';
import { RichText } from '@/components/content/rich-text';
import { UPDATED_AT, type LegalDocument } from '@/content/legal';
import { formatShortDate } from '@/lib/format';

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <Container className="py-12">
      <article className="mx-auto max-w-3xl">
        <h1 className="font-display text-display-2 text-ink">{document.title}</h1>
        <p className="mt-2 text-body-sm text-ink-subtle">
          עדכון אחרון: <span className="tabular">{formatShortDate(`${UPDATED_AT}T00:00:00`)}</span>
        </p>

        {document.intro ? (
          <p className="mt-8 text-body-lg text-ink-muted">
            <RichText text={document.intro} />
          </p>
        ) : null}

        {document.summary ? (
          <aside className="mt-8 rounded-lg border border-line bg-sand p-6">
            <h2 className="text-h3 text-ink">תקציר</h2>
            {document.summaryNote ? (
              <p className="mt-1 text-body-sm text-ink-subtle">{document.summaryNote}</p>
            ) : null}
            <ul className="mt-4 space-y-2">
              {document.summary.map((item) => (
                <li key={item} className="text-body text-ink-muted">
                  <RichText text={item} />
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        <div className="mt-10 space-y-8">
          {document.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-h3 text-ink">
                <RichText text={section.title} />
              </h2>
              <p className="mt-2 text-body text-ink-muted">
                <RichText text={section.body} />
              </p>
            </section>
          ))}
        </div>
      </article>
    </Container>
  );
}
