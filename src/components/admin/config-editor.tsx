'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateConfig } from '@/lib/actions/admin';
import type { Json } from '@/types/database';

type Row = { key: string; value: Json; description: string | null };

export function ConfigEditor({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {rows.map((row) => (
        <ConfigRow key={row.key} row={row} />
      ))}
    </ul>
  );
}

function ConfigRow({ row }: { row: Row }) {
  const router = useRouter();
  const [value, setValue] = useState(JSON.stringify(row.value));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = value !== JSON.stringify(row.value);

  return (
    <li className="flex flex-wrap items-center gap-3 p-4" data-testid="config-row" data-key={row.key}>
      <div className="min-w-56 flex-1">
        <p className="text-body-sm text-ink ltr-isolate">{row.key}</p>
        {row.description ? (
          <p className="mt-0.5 text-caption text-ink-subtle">{row.description}</p>
        ) : null}
      </div>

      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        dir="ltr"
        className="h-9 max-w-40 text-start"
        aria-label={row.key}
      />

      <Button
        size="sm"
        variant={dirty ? 'primary' : 'ghost'}
        disabled={!dirty || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await updateConfig(row.key, value);
            if (!result.ok) setError(result.error);
            else {
              setSaved(true);
              router.refresh();
            }
          })
        }
        data-testid="config-save"
      >
        {pending ? '…' : saved ? 'נשמר' : 'שמירה'}
      </Button>

      {error ? (
        <span className="text-body-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </li>
  );
}
