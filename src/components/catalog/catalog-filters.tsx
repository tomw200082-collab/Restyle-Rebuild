'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CONDITION_LABELS } from '@/lib/labels';

type Option = { value: string; label: string };

/**
 * Filters are URL state, not component state: the page is server-rendered, so
 * a filtered view is shareable, linkable and back-button-correct.
 */
export function CatalogFilters({
  categories,
  brands,
  cities,
}: {
  categories: Option[];
  brands: Option[];
  cities: Option[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      // Any filter change returns to page 1; staying on page 7 of a narrower
      // result set is the classic empty-page bug.
      next.delete('page');
      startTransition(() => router.push(`/catalog?${next.toString()}`, { scroll: false }));
    },
    [params, router],
  );

  const active = ['category', 'brand', 'city', 'condition', 'minPrice', 'maxPrice', 'q'].filter(
    (k) => params.get(k),
  );

  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-5 ${pending ? 'opacity-60' : ''}`}
      aria-busy={pending}
    >
      <FilterSelect
        label="קטגוריה"
        value={params.get('category') ?? ''}
        options={categories}
        placeholder="כל הקטגוריות"
        onChange={(v) => setParam('category', v)}
      />
      <FilterSelect
        label="מותג"
        value={params.get('brand') ?? ''}
        options={brands}
        placeholder="כל המותגים"
        onChange={(v) => setParam('brand', v)}
      />
      <FilterSelect
        label="עיר"
        value={params.get('city') ?? ''}
        options={cities}
        placeholder="כל הערים"
        onChange={(v) => setParam('city', v)}
      />
      <FilterSelect
        label="מצב"
        value={params.get('condition') ?? ''}
        options={Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }))}
        placeholder="כל המצבים"
        onChange={(v) => setParam('condition', v)}
      />
      <FilterSelect
        label="מיון"
        value={params.get('sort') ?? ''}
        options={[
          { value: 'newest', label: 'הכי חדשים' },
          { value: 'price_asc', label: 'מחיר: מהנמוך לגבוה' },
          { value: 'price_desc', label: 'מחיר: מהגבוה לנמוך' },
        ]}
        placeholder="הכי חדשים"
        onChange={(v) => setParam('sort', v)}
      />

      {active.length > 0 ? (
        <div className="sm:col-span-2 lg:col-span-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startTransition(() => router.push('/catalog', { scroll: false }))}
          >
            ניקוי סינון ({active.length})
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = `filter-${label}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-caption font-medium text-ink-muted">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
