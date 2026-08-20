import 'server-only';

import { env } from '@/lib/env';
import { MockPaymentProvider } from './mock';
import { PayPlusProvider } from './payplus';
import { SumitProvider } from './sumit';
import type { PaymentProvider } from './types';

export type {
  CheckoutSession,
  PaymentEvent,
  PaymentOrder,
  PaymentProvider,
  RefundResult,
} from './types';
export { MockPaymentProvider } from './mock';

/**
 * Mock is the default and the only provider the test suite uses. A real
 * provider activates only when explicitly selected AND configured — an
 * unconfigured PAYMENT_PROVIDER falls back rather than failing at checkout,
 * because a broken provider on the money path is worse than a mock. [D-38]
 */
export function getPaymentProvider(): PaymentProvider {
  switch (env.paymentProvider) {
    case 'payplus': {
      const apiKey = process.env.PAYPLUS_API_KEY;
      const secretKey = process.env.PAYPLUS_SECRET_KEY;
      const pageUid = process.env.PAYPLUS_PAGE_UID;
      if (apiKey && secretKey && pageUid) {
        return new PayPlusProvider(apiKey, secretKey, pageUid, env.siteUrl);
      }
      break;
    }
    case 'sumit': {
      const apiKey = process.env.SUMIT_API_KEY;
      const companyId = process.env.SUMIT_COMPANY_ID;
      if (apiKey && companyId) return new SumitProvider(apiKey, companyId);
      break;
    }
    default:
      break;
  }

  return new MockPaymentProvider(env.cronSecret);
}
