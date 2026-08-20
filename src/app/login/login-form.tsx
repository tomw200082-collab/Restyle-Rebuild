'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

type Mode = 'password' | 'otp';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      // Never distinguish "no such user" from "wrong password" — that turns the
      // login form into an account-enumeration oracle.
      setError('הפרטים שהוזנו אינם נכונים. בדקו את כתובת המייל והסיסמה.');
      setBusy(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  async function sendOtp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });

    setBusy(false);
    if (otpError) {
      setError('לא הצלחנו לשלוח קוד. נסו שוב בעוד רגע.');
      return;
    }
    setNotice('שלחנו לכם קישור כניסה למייל. הקישור תקף לשעה.');
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (oauthError) {
      setError('הכניסה עם Google אינה זמינה כרגע. נסו כניסה עם מייל.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={signInWithGoogle}
        disabled={busy}
      >
        המשך עם Google
      </Button>

      <div className="flex items-center gap-3 text-caption text-ink-subtle">
        <span className="h-px flex-1 bg-line" />
        או
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={mode === 'password' ? signInWithPassword : sendOtp} className="space-y-4">
        <Field label="כתובת מייל" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            // Email is LTR even inside an RTL page, or the @ lands visually wrong.
            dir="ltr"
            className="text-start"
            // The field is LTR; the hint is still Hebrew. A Hebrew speaker
            // reading "you@example.com" learns the shape of an address they
            // already know — this says what to type here instead.
            placeholder="הכתובת שלך"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        {mode === 'password' ? (
          <Field label="סיסמה" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              className="text-start"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        ) : null}

        {error ? (
          <p className="text-body-sm text-danger" role="alert" data-testid="login-error">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-body-sm text-success" role="status" data-testid="login-notice">
            {notice}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'רגע…' : mode === 'password' ? 'כניסה' : 'שליחת קישור כניסה'}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'password' ? 'otp' : 'password');
          setError(null);
          setNotice(null);
        }}
        className="w-full text-body-sm text-ink-muted underline-offset-4 hover:underline"
      >
        {mode === 'password' ? 'כניסה עם קישור למייל במקום סיסמה' : 'כניסה עם סיסמה'}
      </button>
    </div>
  );
}
