import 'server-only';

import { Resend } from 'resend';
import { createServiceSupabase } from '@/lib/supabase/service';
import { env, CONTACT } from '@/lib/env';
import { renderEmail, type TemplateData, type TemplateName } from './templates';

export type { TemplateName, TemplateData } from './templates';

export type NotificationRequest = {
  template: TemplateName;
  /** A user id (resolved to an email) or a literal address. */
  to: string;
  orderId?: string;
  listingId?: string;
  recipientRole?: 'buyer' | 'seller' | 'admin';
  /** Repeat sends with the same key are skipped. */
  idempotencyKey?: string;
  data?: TemplateData;
};

export interface NotificationProvider {
  readonly name: string;
  send(request: NotificationRequest): Promise<boolean>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every send is recorded in `outbound_events` before delivery is attempted,
 * with an idempotency key.
 *
 * The legacy platform sent mail from the browser, logged it across three
 * overlapping tables, and accumulated 51 silent failures. Here delivery is
 * server-side, the log is one table, and a failure is a row with a reason
 * rather than a message nobody knows was lost. [LI 8.5]
 */
abstract class BaseNotificationProvider implements NotificationProvider {
  abstract readonly name: string;

  protected abstract deliver(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<{ ok: boolean; error?: string }>;

  async send(request: NotificationRequest): Promise<boolean> {
    const service = createServiceSupabase();
    const key =
      request.idempotencyKey ??
      `${request.template}:${request.orderId ?? request.listingId ?? request.to}`;

    const { data: existing } = await service
      .from('outbound_events')
      .select('id, status')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (existing) return false;

    const recipient = await this.resolveRecipient(request.to);
    if (!recipient) return false;

    const context = await this.contextFor(request);
    const { subject, text, html } = renderEmail(request.template, {
      ...context,
      ...request.data,
    });

    const { data: row } = await service
      .from('outbound_events')
      .insert({
        type: request.template,
        channel: 'email',
        recipient,
        recipient_role: request.recipientRole ?? null,
        subject,
        payload: { ...request.data, orderId: request.orderId ?? null },
        idempotency_key: key,
        status: 'queued',
      })
      .select('id')
      .single();

    const result = await this.deliver(recipient, subject, text, html);

    if (row) {
      await service
        .from('outbound_events')
        .update({
          status: result.ok ? 'sent' : 'failed',
          error: result.error ?? null,
          sent_at: result.ok ? new Date().toISOString() : null,
        })
        .eq('id', row.id);
    }

    return result.ok;
  }

  private async resolveRecipient(to: string): Promise<string | null> {
    if (!UUID.test(to)) return to;

    const { data } = await createServiceSupabase()
      .from('profiles')
      .select('email')
      .eq('id', to)
      .maybeSingle();

    return data?.email ?? null;
  }

  /** Fills the item title and a deep link, which nearly every template uses. */
  private async contextFor(request: NotificationRequest): Promise<TemplateData> {
    const service = createServiceSupabase();

    if (request.orderId) {
      const { data } = await service
        .from('orders')
        .select('id, listings!orders_listing_id_fkey ( title, slug )')
        .eq('id', request.orderId)
        .maybeSingle();

      return {
        item: data?.listings?.title ?? '',
        url: `${env.siteUrl}/dashboard/buyer/orders/${request.orderId}`,
      };
    }

    if (request.listingId) {
      const { data } = await service
        .from('listings')
        .select('title, slug')
        .eq('id', request.listingId)
        .maybeSingle();

      return {
        item: data?.title ?? '',
        url: data?.slug ? `${env.siteUrl}/item/${data.slug}` : env.siteUrl,
      };
    }

    return { url: env.siteUrl };
  }
}

/** Default. Logs instead of sending, so nothing needs credentials. [D-27] */
class MockNotificationProvider extends BaseNotificationProvider {
  readonly name = 'mock';

  protected async deliver(to: string, subject: string, text: string) {
    console.info(
      `\n─── email (mock) ──────────────────────────────\n` +
        `to:      ${to}\nsubject: ${subject}\n\n${text}\n` +
        `───────────────────────────────────────────────\n`,
    );
    return { ok: true };
  }
}

class ResendNotificationProvider extends BaseNotificationProvider {
  readonly name = 'resend';
  private client: Resend;

  constructor(apiKey: string) {
    super();
    this.client = new Resend(apiKey);
  }

  protected async deliver(to: string, subject: string, text: string, html: string) {
    try {
      const { error } = await this.client.emails.send({
        from: `${CONTACT.brand} <${CONTACT.fromEmail}>`,
        replyTo: CONTACT.supportEmail,
        to,
        subject,
        text,
        html,
      });
      return error ? { ok: false, error: error.message } : { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
    }
  }
}

export function getNotificationProvider(): NotificationProvider {
  if (env.emailProvider === 'resend' && env.resendApiKey) {
    return new ResendNotificationProvider(env.resendApiKey);
  }
  return new MockNotificationProvider();
}
