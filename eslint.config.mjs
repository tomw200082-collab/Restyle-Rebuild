import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescriptConfig from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.local-stack/**',
      'src/types/database.ts',
      'next-env.d.ts',
      // Output, not source. `quality/` holds gate evidence and `supabase/.temp`
      // is whatever the Supabase CLI leaves behind after `supabase start` —
      // neither is code anybody wrote, and linting a minified artefact produces
      // a hundred `prefer-const` errors about variables named `t` and `r`.
      // That is what happened in CI: green locally, 185 errors on a runner,
      // because the only difference was a directory the CLI created.
      'quality/**',
      'supabase/.temp/**',
      'supabase/.branches/**',
      '**/*.min.js',
    ],
  },
  ...coreWebVitals,
  ...typescriptConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default config;
