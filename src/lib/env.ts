/**
 * Environment access. Every consumer reads from here so a missing variable
 * fails with a named error at the call site instead of `undefined` leaking
 * into a URL or a client constructor.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get siteUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  },
  get supabaseUrl(): string {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey(): string {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  /** Server-only. Bypasses RLS — every caller must do its own authz check. [D-28] */
  get supabaseServiceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get paymentProvider(): 'mock' | 'payplus' | 'sumit' {
    const v = process.env.PAYMENT_PROVIDER ?? 'mock';
    return v === 'payplus' || v === 'sumit' ? v : 'mock';
  },
  get emailProvider(): 'mock' | 'resend' {
    return process.env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'mock';
  },
  get aiListingEnabled(): boolean {
    return process.env.AI_LISTING_ENABLED === 'true' && Boolean(process.env.ANTHROPIC_API_KEY);
  },
  get anthropicApiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY;
  },
  get resendApiKey(): string | undefined {
    return process.env.RESEND_API_KEY;
  },
  get cronSecret(): string {
    return required('CRON_SECRET', process.env.CRON_SECRET);
  },
  get gaId(): string | undefined {
    return process.env.NEXT_PUBLIC_GA_ID;
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
} as const;

/** Support contact, from the legacy app. [LI 7.1] */
export const CONTACT = {
  supportEmail: 'support@restyle.co.il',
  fromEmail: 'hello@restyle.co.il',
  phone: '053-7252858',
  brand: 'Restyle',
} as const;
