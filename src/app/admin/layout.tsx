import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { requireAdmin } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: { default: 'ניהול', template: '%s | ניהול Restyle' },
  robots: { index: false, follow: false },
};

const NAV = [
  { href: '/admin', label: 'לוח בקרה' },
  { href: '/admin/review', label: 'אישור פריטים' },
  { href: '/admin/listings', label: 'פריטים' },
  { href: '/admin/orders', label: 'הזמנות' },
  { href: '/admin/deliveries', label: 'הובלות' },
  { href: '/admin/payouts', label: 'תשלומים' },
  { href: '/admin/disputes', label: 'בירורים' },
  { href: '/admin/config', label: 'הגדרות' },
];

/**
 * The role gate lives in the layout so every admin route inherits it — a new
 * page cannot be added without protection by forgetting a check.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin('/admin');

  return (
    <div className="min-h-full bg-canvas">
      <div className="border-b border-line bg-surface">
        <Container>
          <nav aria-label="ניהול" className="flex gap-5 overflow-x-auto py-3 text-body-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap text-ink-muted transition-colors hover:text-clay"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </Container>
      </div>
      {children}
    </div>
  );
}
