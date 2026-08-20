/**
 * Runs db/rls_test.sql against DATABASE_URL and fails loudly.
 * Part of Gate 1 and of `npm run verify:db`.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

try {
  const out = execFileSync(
    'psql',
    [url, '-v', 'ON_ERROR_STOP=1', '-q', '-f', join(process.cwd(), 'db', 'rls_test.sql')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  process.stdout.write(out);
} catch (err) {
  const e = err as { stdout?: string; stderr?: string };
  process.stdout.write(e.stdout ?? '');
  process.stderr.write(e.stderr ?? '');
  console.error('\nRLS assertions FAILED.');
  process.exit(1);
}
