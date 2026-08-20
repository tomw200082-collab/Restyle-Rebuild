import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CheckoutSession,
  PaymentEvent,
  PaymentOrder,
  PaymentProvider,
  RefundResult,
} from './types';

/**
 * Local fake PSP. The default provider, so the entire purchase lifecycle is
 * e2e-testable with no credentials. [D-27]
 *
 * Deliberately NOT a shortcut: it redirects to a real page, that page posts a
 * signed callback to the real webhook route, and the signature is really
 * verified. Only the HTTP call to an external processor is replaced. A mock
 * that jumped straight to `status = 'confirmed'` would test nothing.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  constructor(private readonly secret: string) {}

  async createCheckout(order: PaymentOrder): Promise<CheckoutSession> {
    return {
      redirectUrl: `/pay/mock/${order.id}`,
      ref: `mock_${order.id.slice(0, 8)}`,
    };
  }

  sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  private verify(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload), 'hex');
    const given = Buffer.from(signature, 'hex');
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async handleWebhook(request: Request): Promise<PaymentEvent> {
    const raw = await request.text();
    const signature = request.headers.get('x-mock-signature') ?? '';

    if (!this.verify(raw, signature)) {
      return { kind: 'ignored', reason: 'signature mismatch' };
    }

    const body = JSON.parse(raw) as {
      orderId?: string;
      outcome?: string;
      amount_agorot?: number;
    };

    if (!body.orderId) return { kind: 'ignored', reason: 'missing orderId' };

    switch (body.outcome) {
      case 'captured':
        return {
          kind: 'captured',
          orderId: body.orderId,
          ref: `mock_capture_${body.orderId.slice(0, 8)}`,
          amount_agorot: body.amount_agorot ?? 0,
        };
      case 'cancelled':
        return { kind: 'cancelled', orderId: body.orderId };
      case 'failed':
        return { kind: 'failed', orderId: body.orderId, reason: 'mock failure' };
      default:
        return { kind: 'ignored', reason: `unknown outcome ${body.outcome}` };
    }
  }

  async refund(order: PaymentOrder, amountAgorot: number): Promise<RefundResult> {
    return { ok: true, ref: `mock_refund_${order.id.slice(0, 8)}_${amountAgorot}` };
  }
}
