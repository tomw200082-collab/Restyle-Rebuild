import Link from 'next/link';
import { Container } from './container';
import { CONTACT } from '@/lib/env';

const LEGAL = [
  { href: '/how-it-works', label: 'איך זה עובד' },
  { href: '/buyer-protection', label: 'הגנת קונים' },
  { href: '/terms', label: 'תקנון' },
  { href: '/privacy', label: 'מדיניות פרטיות' },
  { href: '/cancellation-policy', label: 'מדיניות ביטולים' },
  { href: '/accessibility', label: 'הצהרת נגישות' },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-sand/40">
      <Container className="py-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <span className="font-display text-h3 text-ink">Restyle</span>
            <p className="mt-2 text-body-sm text-ink-muted">
              רהיטים יד שנייה נבחרים מגוש דן. אנחנו אוספים, מובילים ומגינים על הכסף שלכם.
            </p>
          </div>

          <nav aria-label="קישורים משפטיים">
            <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-body-sm">
              {LEGAL.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-ink-muted transition-colors hover:text-ink">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="text-body-sm text-ink-muted">
            <p>
              <a href={`mailto:${CONTACT.supportEmail}`} className="transition-colors hover:text-ink">
                {CONTACT.supportEmail}
              </a>
            </p>
            {/* Direction-isolated: a leading zero can otherwise migrate visually. */}
            <p className="mt-1">
              <span className="ltr-isolate">{CONTACT.phone}</span>
            </p>
          </div>
        </div>

        <p className="mt-10 border-t border-line pt-6 text-caption text-ink-subtle">
          © Restyle. כל הזכויות שמורות.
        </p>
      </Container>
    </footer>
  );
}
