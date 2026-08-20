import type {
  CheckoutSession,
  PaymentEvent,
  PaymentOrder,
  PaymentProvider,
  RefundResult,
} from './types';

/**
 * Sumit adapter — SKELETON.
 *
 * Sumit is the PSP the legacy platform already runs on, with a live key and
 * exactly one proven real charge. Building it alongside the specified PayPlus
 * adapter costs one file and removes a go-live blocker. [D-38], [LI 5]
 *
 * Ground truth from the legacy audit, which shapes this adapter:
 *   - Direct API with a Bearer secret key; no hosted payment page. The card is
 *     tokenised in the browser into a SingleUseToken and charged server-side.
 *   - Success is `Status === 0`, not an HTTP status.
 *   - **There are no webhooks.** Every call is synchronous request/response,
 *     so `handleWebhook` has nothing to verify and deliberately ignores
 *     everything rather than trusting an unauthenticated body. [LI 5]
 *   - The J5 authorize/capture endpoints were probed and never confirmed,
 *     which is exactly why capture_mode is 'immediate' at MVP. [D-21], [LI 8.8]
 */
export class SumitProvider implements PaymentProvider {
  readonly name = 'sumit';

  private readonly baseUrl = 'https://api.sumit.co.il';

  constructor(
    private readonly apiKey: string,
    private readonly companyId: string,
  ) {}

  /**
   * Sumit has no hosted page, so there is nothing to redirect to. The buyer is
   * sent to an on-site card form which tokenises and then calls `charge`.
   */
  async createCheckout(order: PaymentOrder): Promise<CheckoutSession> {
    return { redirectUrl: `/checkout/${order.id}/card`, ref: `sumit_pending_${order.id.slice(0, 8)}` };
  }

  /** Charges a SingleUseToken produced by the browser card form. */
  async charge(
    order: PaymentOrder,
    singleUseToken: string,
  ): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
    const response = await fetch(`${this.baseUrl}/payments/charge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        Credentials: { CompanyID: this.companyId, APIKey: this.apiKey },
        Customer: { EmailAddress: order.buyerEmail },
        SingleUseToken: singleUseToken,
        Amount: order.total_agorot / 100,
        Currency: 'ILS',
        Description: `Restyle - ${order.description}`,
      }),
    });

    if (!response.ok) return { ok: false, error: `Sumit charge failed: ${response.status}` };

    // Success is Status === 0 in the body, not the HTTP status. [LI 4]
    const data = (await response.json()) as {
      Status?: number;
      Data?: { PaymentID?: string; TransactionID?: string };
      UserErrorMessage?: string;
    };

    if (data.Status !== 0) {
      return { ok: false, error: data.UserErrorMessage ?? `Sumit status ${data.Status}` };
    }

    return { ok: true, ref: data.Data?.PaymentID ?? data.Data?.TransactionID ?? '' };
  }

  /**
   * Sumit sends no webhooks. Rather than accept an unauthenticated body, this
   * ignores everything — the charge path is synchronous and authoritative.
   */
  async handleWebhook(): Promise<PaymentEvent> {
    return { kind: 'ignored', reason: 'Sumit does not send webhooks; charges are synchronous' };
  }

  async refund(
    order: PaymentOrder,
    amountAgorot: number,
    paymentRef: string | null,
  ): Promise<RefundResult> {
    if (!paymentRef) return { ok: false, error: 'no payment reference to refund against' };

    const response = await fetch(`${this.baseUrl}/payments/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        Credentials: { CompanyID: this.companyId, APIKey: this.apiKey },
        PaymentID: paymentRef,
        Amount: amountAgorot / 100,
      }),
    });

    if (!response.ok) return { ok: false, error: `Sumit refund failed: ${response.status}` };

    const data = (await response.json()) as {
      Status?: number;
      Data?: { PaymentID?: string };
      UserErrorMessage?: string;
    };

    if (data.Status !== 0) {
      return { ok: false, error: data.UserErrorMessage ?? `Sumit status ${data.Status}` };
    }
    void order;
    return { ok: true, ref: data.Data?.PaymentID ?? '' };
  }
}
