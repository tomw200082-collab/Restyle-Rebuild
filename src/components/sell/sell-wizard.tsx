'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/image-compress';
import { photoUrl } from '@/lib/storage';
import { formatPrice, parseShekelsToAgorot } from '@/lib/format';
import { submitListing } from '@/lib/actions/listings';
import { CONDITION_LABELS } from '@/lib/labels';
import type { ListingDraft } from '@/lib/ai/types';
import { cn } from '@/lib/utils';

type Option = { value: string; label: string };
type UploadedPhoto = { storage_path: string; width: number; height: number; alt_text: string | null };

const STEPS = ['תמונות', 'פרטי הפריט', 'מידות ומצב', 'איסוף ומחיר', 'סיכום'] as const;

/**
 * Which step owns each validated field, so a submit failure can point at the
 * field instead of leaving the seller to hunt back through the wizard.
 */
const FIELD_STEP: Record<string, { step: number; label: string }> = {
  photos: { step: 0, label: 'תמונות' },
  title: { step: 1, label: 'כותרת' },
  description: { step: 1, label: 'תיאור' },
  category_slug: { step: 1, label: 'קטגוריה' },
  condition: { step: 2, label: 'מצב הפריט' },
  width_cm: { step: 2, label: 'רוחב' },
  depth_cm: { step: 2, label: 'עומק' },
  height_cm: { step: 2, label: 'גובה' },
  pickup_city: { step: 3, label: 'עיר' },
  pickup_street: { step: 3, label: 'רחוב ומספר' },
  pickup_floor: { step: 3, label: 'קומה' },
  price_agorot: { step: 3, label: 'מחיר מבוקש' },
  original_price_agorot: { step: 3, label: 'מחיר קטלוגי' },
};

export function SellWizard({
  userId,
  categories,
  brands,
  cities,
  commissionPct,
  minPhotos,
  maxPhotos,
  aiEnabled,
}: {
  userId: string;
  categories: Option[];
  brands: Option[];
  cities: Option[];
  commissionPct: number;
  minPhotos: number;
  maxPhotos: number;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  // Generated once so all photos for this draft share a folder and the
  // storage path is stable across retries.
  const draftId = useMemo(() => crypto.randomUUID(), []);

  const [step, setStep] = useState(0);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [dimsEstimated, setDimsEstimated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category_slug: '',
    brand_slug: '',
    condition: '',
    width_cm: '',
    depth_cm: '',
    height_cm: '',
    price: '',
    original_price: '',
    pickup_city: '',
    pickup_street: '',
    pickup_floor: '0',
    pickup_has_elevator: false,
    needs_disassembly: false,
    allow_self_pickup: true,
    notes: '',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const priceAgorot = parseShekelsToAgorot(form.price);
  const payout =
    priceAgorot === null ? null : priceAgorot - Math.floor((priceAgorot * commissionPct) / 100);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploading(true);
      setFormError(null);

      const supabase = createClient();
      const room = maxPhotos - photos.length;
      const chosen = Array.from(files).slice(0, room);
      const uploaded: UploadedPhoto[] = [];

      const failures: string[] = [];

      for (const [i, file] of chosen.entries()) {
        let prepared: Awaited<ReturnType<typeof compressImage>>;
        try {
          prepared = await compressImage(file);
        } catch {
          // An undecodable file will never succeed, so "try again" would be
          // useless advice. Name the file and say what to do instead.
          failures.push(`${file.name} — הקובץ אינו תמונה תקינה`);
          continue;
        }

        try {
          const path = `${userId}/${draftId}/${photos.length + i + 1}.webp`;
          const { error } = await supabase.storage
            .from('listing-photos')
            .upload(path, prepared.blob, { contentType: 'image/webp', upsert: true });
          if (error) throw error;
          uploaded.push({
            storage_path: path,
            width: prepared.width,
            height: prepared.height,
            alt_text: null,
          });
        } catch {
          failures.push(`${file.name} — ההעלאה נכשלה, נסו שוב`);
        }
      }

      if (failures.length) setFormError(`לא הצלחנו להעלות: ${failures.join(' · ')}`);

      setPhotos((prev) => [...prev, ...uploaded]);
      setUploading(false);
    },
    [draftId, maxPhotos, photos.length, userId],
  );

  async function requestDraft() {
    if (photos.length < minPhotos) return;
    setDrafting(true);
    setAiNote(null);

    try {
      const response = await fetch('/api/ai/listing-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photoUrls: photos.map((p) => photoUrl(p.storage_path)) }),
      });

      if (response.ok) {
        const { draft } = (await response.json()) as { draft: ListingDraft };
        applyDraft(draft);
        setAiNote('הכנו טיוטה מהתמונות. עברו עליה ותקנו כל מה שצריך — אתם מאשרים הכל.');
      } else {
        setAiNote('לא הצלחנו להכין טיוטה מהתמונות. אפשר למלא ידנית.');
      }
    } catch {
      setAiNote('לא הצלחנו להכין טיוטה מהתמונות. אפשר למלא ידנית.');
    }

    setDrafting(false);
    setStep(1);
  }

  function applyDraft(draft: ListingDraft) {
    setForm((f) => ({
      ...f,
      title: draft.title_he || f.title,
      description: draft.description_he || f.description,
      category_slug: draft.category_slug ?? f.category_slug,
      brand_slug: brands.find((b) => b.label === draft.brand_name)?.value ?? f.brand_slug,
      condition: draft.condition ?? f.condition,
      width_cm: draft.width_cm ? String(draft.width_cm) : f.width_cm,
      depth_cm: draft.depth_cm ? String(draft.depth_cm) : f.depth_cm,
      height_cm: draft.height_cm ? String(draft.height_cm) : f.height_cm,
      price: draft.suggested_price_agorot ? String(draft.suggested_price_agorot / 100) : f.price,
      original_price: draft.original_price_agorot
        ? String(draft.original_price_agorot / 100)
        : f.original_price,
    }));
    setDimsEstimated(draft.dimensions_estimated);
    if (draft.alt_texts.length) {
      setPhotos((prev) => prev.map((p, i) => ({ ...p, alt_text: draft.alt_texts[i] ?? p.alt_text })));
    }
  }

  async function onSubmit() {
    setSubmitting(true);
    setErrors({});
    setFormError(null);

    const result = await submitListing({
      title: form.title,
      description: form.description,
      category_slug: form.category_slug,
      brand_slug: form.brand_slug || undefined,
      condition: form.condition,
      width_cm: Number(form.width_cm),
      depth_cm: Number(form.depth_cm),
      height_cm: Number(form.height_cm),
      price_agorot: parseShekelsToAgorot(form.price) ?? 0,
      original_price_agorot: parseShekelsToAgorot(form.original_price),
      pickup_city: form.pickup_city,
      pickup_street: form.pickup_street,
      pickup_floor: Number(form.pickup_floor),
      pickup_has_elevator: form.pickup_has_elevator,
      needs_disassembly: form.needs_disassembly,
      allow_self_pickup: form.allow_self_pickup,
      notes: form.notes || undefined,
      photos: photos.map((p) => ({
        storage_path: p.storage_path,
        alt_text: p.alt_text,
        width: p.width,
        height: p.height,
      })),
    });

    setSubmitting(false);

    if (result.ok) {
      router.push('/sell/new/submitted');
      router.refresh();
      return;
    }

    setFormError(result.error);
    if (result.fields) setErrors(result.fields);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm" aria-label="שלבים">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={cn(i === step ? 'font-medium text-clay' : 'text-ink-subtle')}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="mt-8 space-y-6">
        {step === 0 ? (
          <section aria-labelledby="step-photos" className="space-y-4">
            <h2 id="step-photos" className="text-h2 text-ink">מתחילים מהתמונות</h2>
            <p className="text-body text-ink-muted">
              {minPhotos}–{maxPhotos} תמונות. הראשונה היא תמונת השער. אור טבעי ורקע נקי מוכרים
              מהר יותר.
            </p>

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => onFiles(e.target.files)}
            />

            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => fileInput.current?.click()}
              disabled={uploading || photos.length >= maxPhotos}
              data-testid="photo-upload"
            >
              <Upload aria-hidden className="size-4" />
              {uploading ? 'מעלים…' : 'בחירת תמונות'}
            </Button>

            {photos.length > 0 ? (
              <ul className="grid grid-cols-3 gap-3" data-testid="photo-list">
                {photos.map((photo, index) => (
                  <li key={photo.storage_path} className="relative">
                    <Image
                      src={photoUrl(photo.storage_path)}
                      alt=""
                      width={photo.width}
                      height={photo.height}
                      sizes="33vw"
                      className="aspect-square w-full rounded-md object-cover"
                    />
                    {index === 0 ? (
                      <Badge tone="clay" className="absolute top-2 start-2">שער</Badge>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`הסרת תמונה ${index + 1}`}
                      onClick={() => setPhotos((p) => p.filter((_, i) => i !== index))}
                      className="absolute top-2 end-2 rounded-sm bg-surface/90 p-1 text-ink hover:bg-surface"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-body-sm text-ink-subtle">
              {photos.length} מתוך {maxPhotos} תמונות
            </p>

            {formError ? (
              <p className="text-body-sm text-danger" role="alert" data-testid="photo-error">
                {formError}
              </p>
            ) : null}

            {photos.length > 0 && photos.length < minPhotos ? (
              <p className="text-body-sm text-ink-muted">
                צריך עוד {minPhotos - photos.length} תמונות כדי להמשיך.
              </p>
            ) : null}

            <Button
              type="button"
              size="lg"
              disabled={photos.length < minPhotos || drafting}
              onClick={aiEnabled ? requestDraft : () => setStep(1)}
              data-testid="photos-continue"
            >
              {drafting ? 'קוראים את התמונות ומכינים טיוטה…' : 'המשך'}
            </Button>
          </section>
        ) : null}

        {step === 1 ? (
          <section aria-labelledby="step-details" className="space-y-4">
            <h2 id="step-details" className="text-h2 text-ink">פרטי הפריט</h2>
            {aiNote ? (
              <p className="rounded-md bg-clay-soft px-3 py-2 text-body-sm text-clay-hover" role="status">
                {aiNote}
              </p>
            ) : null}

            <Field label="כותרת" htmlFor="title" error={errors.title}>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="לדוגמה: ספה תלת מושבית איקאה"
                invalid={Boolean(errors.title)}
              />
            </Field>

            <Field label="תיאור" htmlFor="description" error={errors.description}
              hint="ספרו מה מצב הפריט באמת. כל פריט נבדק באיסוף, ואי־התאמה מבטלת את העסקה.">
              <Textarea
                id="description"
                rows={6}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>

            <Field label="קטגוריה" htmlFor="category" error={errors.category_slug}>
              <Select
                id="category"
                value={form.category_slug}
                onChange={(e) => set('category_slug', e.target.value)}
              >
                <option value="">בחרו קטגוריה</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </Field>

            <Field label="מותג" htmlFor="brand" optional>
              <Select id="brand" value={form.brand_slug} onChange={(e) => set('brand_slug', e.target.value)}>
                <option value="">ללא מותג / לא ידוע</option>
                {brands.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </Select>
            </Field>

            <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} />
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="step-dims" className="space-y-4">
            <h2 id="step-dims" className="text-h2 text-ink">מידות ומצב</h2>

            {dimsEstimated ? (
              <p className="rounded-md bg-warning-soft px-3 py-2 text-body-sm text-warning" role="status">
                המידות הוערכו מהתמונות — <strong>לאמת</strong> עם סרט מדידה. מידה שגויה שולחת צוות
                עם רכב לא מתאים.
              </p>
            ) : null}

            <div className="grid grid-cols-3 gap-3">
              {(['width_cm', 'depth_cm', 'height_cm'] as const).map((key, i) => (
                <Field
                  key={key}
                  label={['רוחב (ס״מ)', 'עומק (ס״מ)', 'גובה (ס״מ)'][i]!}
                  htmlFor={key}
                  error={errors[key]}
                >
                  <Input
                    id={key}
                    inputMode="numeric"
                    dir="ltr"
                    className="text-start"
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    invalid={Boolean(errors[key])}
                  />
                </Field>
              ))}
            </div>

            <Field label="מצב הפריט" htmlFor="condition" error={errors.condition}>
              <Select id="condition" value={form.condition} onChange={(e) => set('condition', e.target.value)}>
                <option value="">בחרו מצב</option>
                {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>

            <label className="flex items-center gap-2 text-body text-ink">
              <input
                type="checkbox"
                checked={form.needs_disassembly}
                onChange={(e) => set('needs_disassembly', e.target.checked)}
                className="size-4 rounded-sm border-line-strong accent-[var(--color-clay)]"
              />
              הפריט דורש פירוק והרכבה
            </label>

            <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} />
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-labelledby="step-pickup" className="space-y-4">
            <h2 id="step-pickup" className="text-h2 text-ink">איסוף ומחיר</h2>

            <Field label="עיר" htmlFor="city" error={errors.pickup_city}>
              <Select id="city" value={form.pickup_city} onChange={(e) => set('pickup_city', e.target.value)}>
                <option value="">בחרו עיר</option>
                {cities.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </Field>

            <Field
              label="רחוב ומספר"
              htmlFor="street"
              error={errors.pickup_street}
              hint="הכתובת המדויקת פרטית ולא מוצגת באתר. מוצגת רק העיר."
            >
              <Input
                id="street"
                value={form.pickup_street}
                onChange={(e) => set('pickup_street', e.target.value)}
                invalid={Boolean(errors.pickup_street)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="קומה" htmlFor="floor" error={errors.pickup_floor}>
                <Select id="floor" value={form.pickup_floor} onChange={(e) => set('pickup_floor', e.target.value)}>
                  {Array.from({ length: 21 }, (_, i) => (
                    <option key={i} value={String(i)}>{i === 0 ? 'קרקע' : i}</option>
                  ))}
                </Select>
              </Field>

              <div className="flex items-end pb-3">
                <label className="flex items-center gap-2 text-body text-ink">
                  <input
                    type="checkbox"
                    checked={form.pickup_has_elevator}
                    onChange={(e) => set('pickup_has_elevator', e.target.checked)}
                    className="size-4 rounded-sm border-line-strong accent-[var(--color-clay)]"
                  />
                  יש מעלית
                </label>
              </div>
            </div>

            <Field label="מחיר מבוקש" htmlFor="price" error={errors.price_agorot}>
              <Input
                id="price"
                inputMode="numeric"
                dir="ltr"
                className="text-start"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                invalid={Boolean(errors.price_agorot)}
              />
            </Field>

            {/* The gross/net inversion is invisible to a returning seller, who
                will type the number they always typed. [D-36] */}
            <div className="rounded-md bg-sand px-4 py-3">
              <p className="text-caption text-ink-muted">תקבלו</p>
              <p className="font-display text-h2 text-clay tabular" data-testid="wizard-payout">
                {payout === null ? '—' : formatPrice(payout)}
              </p>
              <p className="mt-1 text-body-sm text-ink-subtle">
                אחרי עמלת Restyle של {commissionPct}%.
                {priceAgorot !== null ? ` הקונה משלם ${formatPrice(priceAgorot)}.` : ''}
              </p>
            </div>

            <Field label="מחיר קטלוגי" htmlFor="original-price" optional
              hint="המחיר החדש בחנות, אם ידוע. מוצג כמחיר מחוק לצד המחיר שלכם.">
              <Input
                id="original-price"
                inputMode="numeric"
                dir="ltr"
                className="text-start"
                value={form.original_price}
                onChange={(e) => set('original_price', e.target.value)}
              />
            </Field>

            <label className="flex items-center gap-2 text-body text-ink">
              <input
                type="checkbox"
                checked={form.allow_self_pickup}
                onChange={(e) => set('allow_self_pickup', e.target.checked)}
                className="size-4 rounded-sm border-line-strong accent-[var(--color-clay)]"
              />
              מאפשר איסוף עצמי על ידי הקונה
            </label>

            <StepNav onBack={() => setStep(2)} onNext={() => setStep(4)} />
          </section>
        ) : null}

        {step === 4 ? (
          <section aria-labelledby="step-review" className="space-y-4">
            <h2 id="step-review" className="text-h2 text-ink">סיכום</h2>

            <dl className="divide-y divide-line rounded-lg border border-line bg-surface text-body-sm">
              <Row label="כותרת" value={form.title || '—'} />
              <Row label="קטגוריה" value={categories.find((c) => c.value === form.category_slug)?.label ?? '—'} />
              <Row label="מצב" value={CONDITION_LABELS[form.condition as keyof typeof CONDITION_LABELS] ?? '—'} />
              <Row label="מידות" value={`${form.width_cm} × ${form.depth_cm} × ${form.height_cm} ס״מ`} />
              <Row label="עיר" value={form.pickup_city || '—'} />
              <Row label="מחיר" value={priceAgorot ? formatPrice(priceAgorot) : '—'} />
              <Row label="תקבלו" value={payout ? formatPrice(payout) : '—'} />
              <Row label="תמונות" value={String(photos.length)} />
            </dl>

            {formError ? (
              <div
                className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3"
                role="alert"
                data-testid="submit-error"
              >
                <p className="text-body-sm font-medium text-danger">{formError}</p>
                {Object.keys(errors).length > 0 ? (
                  <ul className="mt-2 space-y-1" data-testid="submit-field-errors">
                    {Object.entries(errors).map(([field, message]) => {
                      const target = FIELD_STEP[field.split('.')[0] ?? field];
                      return (
                        <li key={field} className="text-body-sm text-danger">
                          {message}
                          {target ? (
                            <button
                              type="button"
                              onClick={() => setStep(target.step)}
                              className="ms-2 underline underline-offset-2"
                            >
                              תיקון ({target.label})
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="flex gap-3">
              <Button type="button" variant="secondary" size="lg" onClick={() => setStep(3)}>
                חזרה
              </Button>
              <Button
                type="button"
                size="lg"
                onClick={onSubmit}
                disabled={submitting}
                data-testid="submit-listing"
              >
                {submitting ? 'שולחים…' : 'שליחה לאישור'}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function StepNav({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex gap-3 pt-2">
      <Button type="button" variant="secondary" size="lg" onClick={onBack}>
        חזרה
      </Button>
      <Button type="button" size="lg" onClick={onNext} data-testid="step-next">
        המשך
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
