import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'הפריט נשלח לאישור',
  robots: { index: false, follow: false },
};

export default function SubmittedPage() {
  return (
    <Container className="py-20">
      <div className="mx-auto max-w-md text-center">
        <h1 className="font-display text-h1 text-ink" data-testid="submitted-title">
          הפריט נשלח לאישור
        </h1>
        <p className="mt-4 text-body-lg text-ink-muted">
          נעבור על הפריט ונאשר אותו בדרך כלל תוך יום עסקים. נעדכן אתכם במייל.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard/seller">למכירות שלי</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/sell/new">פרסום פריט נוסף</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
