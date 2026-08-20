import { Container } from '@/components/layout/container';
import { ConfigEditor } from '@/components/admin/config-editor';
import { ZoneEditor } from '@/components/admin/zone-editor';
import { createServiceSupabase } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הגדרות' };

export default async function ConfigPage() {
  const service = createServiceSupabase();
  const [{ data: config }, { data: zones }] = await Promise.all([
    service.from('site_config').select('key, value, description, is_public').order('key'),
    service.from('delivery_zones').select('city, zone, fee_agorot').order('zone').order('city'),
  ]);

  // admin_email is operational rather than commercial, and exposing it beside
  // the fee knobs invites an accidental edit that silently changes who gets
  // admin on the next signup.
  const editable = (config ?? []).filter((row) => row.key !== 'admin_email');

  return (
    <Container className="py-8">
      <h1 className="font-display text-h1 text-ink">הגדרות</h1>
      <p className="mt-2 text-body-sm text-ink-subtle">
        שינויים כאן משפיעים מיידית על מחירים והתראות באתר. הערכים נשמרים כ-JSON.
      </p>

      <section className="mt-8">
        <h2 className="text-h3 text-ink">תעריפי הובלה</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          התעריף נקבע לפי אזור. בהזמנה בין אזורים נגבה האזור היקר מבין השניים.
        </p>
        <div className="mt-4">
          <ZoneEditor zones={zones ?? []} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-h3 text-ink">פרמטרים</h2>
        <div className="mt-4">
          <ConfigEditor rows={editable} />
        </div>
      </section>
    </Container>
  );
}
