'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateZoneFee } from '@/lib/actions/admin';
import { formatPrice, parseShekelsToAgorot } from '@/lib/format';

type Zone = { city: string; zone: string; fee_agorot: number };

export function ZoneEditor({ zones }: { zones: Zone[] }) {
  const grouped = new Map<string, Zone[]>();
  for (const zone of zones) {
    grouped.set(zone.zone, [...(grouped.get(zone.zone) ?? []), zone]);
  }

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([zone, cities]) => (
        <div key={zone}>
          <h3 className="text-caption font-medium text-ink-muted">
            אזור {zone} · {formatPrice(cities[0]?.fee_agorot ?? 0)}
          </h3>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
            {cities.map((city) => (
              <ZoneRow key={city.city} zone={city} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ZoneRow({ zone }: { zone: Zone }) {
  const router = useRouter();
  const [value, setValue] = useState(String(zone.fee_agorot / 100));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const agorot = parseShekelsToAgorot(value);
  const dirty = agorot !== null && agorot !== zone.fee_agorot;

  return (
    <li className="flex items-center gap-3 p-3" data-testid="zone-row" data-city={zone.city}>
      <span className="flex-1 text-body-sm text-ink">{zone.city}</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        dir="ltr"
        inputMode="numeric"
        className="h-9 max-w-28 text-start"
        aria-label={`תעריף ${zone.city}`}
      />
      <Button
        size="sm"
        variant={dirty ? 'primary' : 'ghost'}
        disabled={!dirty || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await updateZoneFee(zone.city, agorot ?? 0);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
      >
        שמירה
      </Button>
      {error ? (
        <span className="text-body-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </li>
  );
}
