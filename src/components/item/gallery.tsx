'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { photoUrl } from '@/lib/storage';

type Photo = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  sort: number;
  width: number | null;
  height: number | null;
};

/**
 * Photography-first: the gallery is the first element on mobile and the
 * start-side of the split on desktop. No card, no border, no shadow.
 */
export function Gallery({ photos, title }: { photos: Photo[]; title: string }) {
  const ordered = [...photos].sort((a, b) => a.sort - b.sort);
  const [activeIndex, setActiveIndex] = useState(0);
  const active = ordered[activeIndex] ?? ordered[0];

  if (!active) {
    return <div className="aspect-4/3 w-full rounded-lg bg-sand" aria-hidden />;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg bg-sand">
        <Image
          key={active.id}
          src={photoUrl(active.storage_path)}
          alt={active.alt_text ?? title}
          width={active.width ?? 1200}
          height={active.height ?? 900}
          priority
          sizes="(max-width: 1024px) 100vw, 58vw"
          className="aspect-4/3 w-full object-cover"
        />
      </div>

      {ordered.length > 1 ? (
        <ul className="grid grid-cols-5 gap-2" role="tablist" aria-label="תמונות הפריט">
          {ordered.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={`תמונה ${index + 1}`}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  'block w-full overflow-hidden rounded-md border-2 transition-colors',
                  index === activeIndex ? 'border-clay' : 'border-transparent hover:border-line-strong',
                )}
              >
                <Image
                  src={photoUrl(photo.storage_path)}
                  alt=""
                  width={240}
                  height={240}
                  sizes="20vw"
                  className="aspect-square w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
