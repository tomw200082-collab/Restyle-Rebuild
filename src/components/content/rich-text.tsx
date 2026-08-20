import { Fragment } from 'react';

/**
 * Renders the `**bold**` runs the source copy carries, and nothing else.
 *
 * The legal text arrived as markdown-flavoured Hebrew where the emphasis is
 * load-bearing — „**48 שעות**", „**50 ש\"ח**" — so stripping it would quietly
 * flatten the document's own emphasis, and running it through a full markdown
 * parser would be a dependency and an injection surface for one feature.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-medium text-ink">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
