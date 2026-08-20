'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ManifestCopy({ manifest }: { manifest: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(manifest);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <details className="rounded-lg border border-line bg-surface p-4">
      <summary className="cursor-pointer text-body font-medium text-ink">מניפסט יומי</summary>

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={copy} data-testid="copy-manifest">
          {copied ? 'הועתק' : 'העתקה'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => window.print()}>
          הדפסה
        </Button>
      </div>

      <pre
        className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md bg-sand p-3 text-body-sm text-ink"
        data-testid="manifest-text"
      >
        {manifest}
      </pre>
    </details>
  );
}
