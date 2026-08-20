export type PaymentOrder = {
  id: string;
  total_agorot: number;
  /** Short human reference shown on the statement. */
  description: string;
  buyerEmail: string;
};

export type PaymentEvent =
  | { kind: 'captured'; orderId: string; ref: string; amount_agorot: number }
  | { kind: 'failed'; orderId: string; reason: string }
  | { kind: 'cancelled'; orderId: string }
  | { kind: 'refunded'; orderId: string; ref: string; amount_agorot: number }
  | { kind: 'ignored'; reason: string };

export type CheckoutSession = { redirectUrl: string; ref: string };

export type RefundResult = { ok: true; ref: string } | { ok: false; error: string };

export interface PaymentProvider {
  readonly name: string;

  /** Creates a hosted-payment session and returns where to send the buyer. */
  createCheckout(order: PaymentOrder): Promise<CheckoutSession>;

  /**
   * Verifies and normalises a provider callback. Implementations MUST verify
   * the signature before trusting anything in the body — a webhook endpoint
   * that skips verification is an endpoint anyone can use to mark orders paid.
   */
  handleWebhook(request: Request): Promise<PaymentEvent>;

  refund(order: PaymentOrder, amountAgorot: number, paymentRef: string | null): Promise<RefundResult>;
}
