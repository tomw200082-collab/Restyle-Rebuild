import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'הדף לא נמצא' };

/**
 * A 404 on a marketplace is usually someone who followed a link to an item
 * that was removed, so the page's job is to get them back into the catalogue
 * rather than to apologise.
 */
export default function NotFound() {
  return (
    <Container className="py-24">
      <div className="mx-auto max-w-lg text-center">
        <p className="font-display text-display-2 text-clay tabular">404</p>
        <h1 className="mt-4 font-display text-h1 text-ink">לא מצאנו את הדף הזה</h1>
        <p className="mt-3 text-body-lg text-ink-muted">
          יכול להיות שהפריט נמכר והוסר, או שהקישור לא מדויק. הקטלוג מתעדכן כל יום — שווה להסתכל
          מה יש עכשיו.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/catalog">לקטלוג</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/">לדף הבית</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
