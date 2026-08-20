'use client';

/**
 * Replaces the root layout when the failure is in the layout itself, so it
 * cannot use Container, the fonts, or any token — none of them have loaded.
 * Everything here is inline and self-contained by necessity.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAF7F2',
          color: '#22201D',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 500, margin: 0 }}>האתר לא נטען כרגע</h1>
          <p style={{ marginTop: '0.75rem', lineHeight: 1.65, color: '#5A544D' }}>
            אנחנו כבר מטפלים בזה. אפשר לרענן בעוד רגע, או לכתוב לנו ל-support@restyle.co.il.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '10px',
              border: 'none',
              background: '#A55335',
              color: '#fff',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            רענון
          </button>
          {error.digest ? (
            <p style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#6F6961' }}>
              קוד תקלה <span dir="ltr">{error.digest}</span>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
