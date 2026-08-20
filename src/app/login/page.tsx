import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { getCurrentUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'כניסה',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(next ?? '/');

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-sm">
        <h1 className="font-display text-h1 text-ink">כניסה ל-Restyle</h1>
        <p className="mt-2 text-body text-ink-muted">
          כניסה נדרשת כדי לרכוש, למכור ולעקוב אחרי ההזמנות שלכם.
        </p>
        <LoginForm next={next ?? '/'} />
      </div>
    </Container>
  );
}
