'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/image-compress';
import { photoUrl } from '@/lib/storage';
import { openDispute } from '@/lib/actions/disputes';

const REASONS = [
  { value: 'wrong_item', label: 'קיבלתי פריט שונה ממה שהוזמן' },
  { value: 'missing_parts', label: 'חסרים חלקים מהותיים' },
  { value: 'damaged', label: 'הפריט הגיע פגום' },
  { value: 'not_as_described', label: 'אי־התאמה מהותית לתיאור' },
];

export function DisputeForm({ orderId, userId }: { orderId: string; userId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);

    const supabase = createClient();
    const uploaded: string[] = [];

    for (const [i, file] of Array.from(files).slice(0, 10 - photos.length).entries()) {
      try {
        const { blob } = await compressImage(file);
        const path = `${userId}/disputes/${orderId}/${photos.length + i + 1}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('listing-photos')
          .upload(path, blob, { contentType: 'image/webp', upsert: true });
        if (uploadError) throw uploadError;
        uploaded.push(path);
      } catch {
        setError(`${file.name} — לא הצלחנו להעלות את התמונה`);
      }
    }

    setPhotos((p) => [...p, ...uploaded]);
    setUploading(false);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await openDispute({
        orderId,
        reason,
        description,
        photo_paths: photos,
      });
      if (!result.ok) setError(result.error);
      else router.push(`/dashboard/buyer/orders/${orderId}`);
    });
  }

  return (
    <div className="mt-8 space-y-5">
      <Field label="מה הבעיה?" htmlFor="reason">
        <Select id="reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">בחרו סיבה</option>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
      </Field>

      <Field
        label="תיאור"
        htmlFor="description"
        hint="ככל שהתיאור מפורט יותר, כך נוכל להכריע מהר יותר."
      >
        <Textarea
          id="description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div>
        <p className="text-caption font-medium text-ink-muted">תמונות שמראות את הבעיה</p>
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
          size="sm"
          className="mt-2"
          onClick={() => fileInput.current?.click()}
          disabled={uploading || photos.length >= 10}
        >
          <Upload aria-hidden className="size-4" />
          {uploading ? 'מעלים…' : 'הוספת תמונות'}
        </Button>

        {photos.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {photos.map((path) => (
              <li key={path}>
                <Image
                  src={photoUrl(path)}
                  alt=""
                  width={80}
                  height={80}
                  className="size-20 rounded-md object-cover"
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p className="text-body-sm text-danger" role="alert" data-testid="dispute-form-error">
          {error}
        </p>
      ) : null}

      <Button
        size="lg"
        onClick={submit}
        disabled={pending || !reason || description.trim().length < 10}
        data-testid="dispute-submit"
      >
        {pending ? 'שולחים…' : 'שליחת בקשת בירור'}
      </Button>

      <p className="text-body-sm text-ink-subtle">
        התשלום למוכר מוקפא עד לסיום הבדיקה. נחזור אליכם עם החלטה תוך 3-5 ימי עסקים.
      </p>
    </div>
  );
}
