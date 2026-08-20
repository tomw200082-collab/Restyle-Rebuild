import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CheckoutSession,
  PaymentEvent,
  PaymentOrder,
  PaymentProvider,
  RefundResult,
} from './types';

/**
 * PayPlus adapter — SKELETON.
 *
 * The request/response shapes below follow PayPlus's documented hosted-page
 * flow, but they are unverified against a live account. Every place that needs
 * confirming against the current API docs is marked TODO(payplus).
 *
 * Nothing here runs unless PAYMENT_PROVIDER=payplus, and the mock remains the
 * default, so an unfinished adapter cannot affect anyone by accident.
 */
export class PayPlusProvider implements PaymentProvider {
  readonly name = 'payplus';

  private readonly baseUrl = 'https://restapi.payplus.co.il/api/v1.0';

  constructor(
    private readonly apiKey: string,
    private readonly secretKey: string,
    private readonly pageUid: string,
    private readonly siteUrl: string,
  ) {}

  async createCheckout(order: PaymentOrder): Promise<CheckoutSession> {
    // TODO(payplus): confirm the endpoint path and payload against current docs.
    const response = await fetch(`${this.baseUrl}/PaymentPages/generateLink`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: JSON.stringify({ api_key: this.apiKey, secret_key: this.secretKey }),
      },
      body: JSON.stringify({
        payment_page_uid: this.pageUid,
        charge_method: 1, // 1 = immediate charge. capture_mode is 'immediate' at MVP. [D-21]
        amount: order.total_agorot / 100,
        currency_code: 'ILS',
        sendEmailApproval: false,
        more_info: order.id,
        refURL_success: `${this.siteUrl}/checkout/${order.id}/success`,
        refURL_failure: `${this.siteUrl}/checkout/${order.id}/cancelled`,
        refURL_callback: `${this.siteUrl}/api/payments/webhook`,
      }),
    });

    if (!response.ok) {
      throw new Error(`PayPlus generateLink failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      data?: { payment_page_link?: string; page_request_uid?: string };
    };

    const link = data.data?.payment_page_link;
    if (!link) throw new Error('PayPlus returned no payment link');

    return { redirectUrl: link, ref: data.data?.page_request_uid ?? order.id };
  }

  async handleWebhook(request: Request): Promise<PaymentEvent> {
    const raw = await request.text();

    // TODO(payplus): confirm the signature header name and the exact bytes
    // that are signed. Until confirmed this must fail closed, never open —
    // a webhook that skips verification is an endpoint anyone can use to mark
    // orders paid.
    const signature = request.headers.get('hash') ?? '';
    const expected = createHmac('sha256', this.secretKey).update(raw).digest('base64');

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { kind: 'ignored', reason: 'signature mismatch' };
    }

    const body = JSON.parse(raw) as {
      more_info?: string;
      status_code?: string;
      transaction_uid?: string;
      amount?: number;
    };

    const orderId = body.more_info;
    if (!orderId) return { kind: 'ignored', reason: 'missing more_info (order id)' };

    // TODO(payplus): confirm the success status code.
    if (body.status_code === '000') {
      return {
        kind: 'captured',
        orderId,
        ref: body.transaction_uid ?? '',
        amount_agorot: Math.round((body.amount ?? 0) * 100),
      };
    }

    return { kind: 'failed', orderId, reason: `status ${body.status_code}` };
  }

  async refund(
    order: PaymentOrder,
    amountAgorot: number,
    paymentRef: string | null,
  ): Promise<RefundResult> {
    if (!paymentRef) return { ok: false, error: 'no payment reference to refund against' };

    // TODO(payplus): confirm the refund endpoint and payload.
    const response = await fetch(`${this.baseUrl}/Transactions/RefundByTransactionUID`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: JSON.stringify({ api_key: this.apiKey, secret_key: this.secretKey }),
      },
      body: JSON.stringify({
        transaction_uid: paymentRef,
        amount: amountAgorot / 100,
        more_info: order.id,
      }),
    });

    if (!response.ok) return { ok: false, error: `PayPlus refund failed: ${response.status}` };

    const data = (await response.json()) as { data?: { transaction_uid?: string } };
    return { ok: true, ref: data.data?.transaction_uid ?? '' };
  }
}
