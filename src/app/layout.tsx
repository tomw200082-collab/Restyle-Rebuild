import type { Metadata, Viewport } from 'next';
import { Frank_Ruhl_Libre, Heebo } from 'next/font/google';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { env } from '@/lib/env';
import './globals.css';

const frankRuhl = Frank_Ruhl_Libre({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-frank-ruhl',
  display: 'swap',
});

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-heebo',
  display: 'swap',
});

export const metadata: Metadata = {
  // Without metadataBase every canonical and OG URL ships relative and breaks
  // in production.
  metadataBase: new URL(env.siteUrl),
  title: {
    default: 'Restyle — רהיטים יד שנייה איכותיים בגוש דן',
    template: '%s | Restyle',
  },
  description:
    'רהיטים יד שנייה נבחרים, עם הובלה עד הבית ותשלום מאובטח. ספות, שולחנות, ארונות ועוד — בתל אביב, רמת גן והסביבה.',
  applicationName: 'Restyle',
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'Restyle',
  },
};

export const viewport: Viewport = {
  themeColor: '#FAF7F2',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${frankRuhl.variable} ${heebo.variable}`}>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-ink"
        >
          דילוג לתוכן הראשי
        </a>
        <div className="flex min-h-dvh flex-col">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
