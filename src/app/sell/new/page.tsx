import type { Metadata } from 'next';
import { Container } from '@/components/layout/container';
import { SellWizard } from '@/components/sell/sell-wizard';
import { requireUser } from '@/lib/auth/session';
import { getTaxonomy } from '@/lib/db/listings';
import { getDeliveryZones, getSiteConfig } from '@/lib/pricing/config';

export const metadata: Metadata = {
  title: 'פרסום פריט',
  robots: { index: false, follow: false },
};

export default async function NewListingPage() {
  const user = await requireUser('/sell/new');
  const [{ categories, brands }, zones, config] = await Promise.all([
    getTaxonomy(),
    getDeliveryZones(),
    getSiteConfig(),
  ]);

  return (
    <Container className="py-10">
      <h1 className="font-display text-h1 text-ink">פרסום פריט</h1>
      <p className="mt-2 text-body text-ink-muted">
        הפרסום חינם. העמלה נגבית רק כשהפריט נמכר.
      </p>

      <div className="mt-10">
        <SellWizard
          userId={user.id}
          categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
          brands={brands.map((b) => ({ value: b.slug, label: b.name }))}
          cities={zones.map((z) => ({ value: z.city, label: z.city }))}
          commissionPct={config.commission_pct}
          minPhotos={config.min_photos}
          maxPhotos={config.max_photos}
          // Always on: with no API key the provider is the deterministic mock,
          // so the draft step works identically and the flow stays testable. [D-27]
          aiEnabled
        />
      </div>
    </Container>
  );
}
