/**
 * Minimal .env loader for scripts that run outside Next.
 *
 * Next loads `.env.local` for the application; a plain `tsx script.ts` does
 * not, so a gate run would see none of the target configuration and skip the
 * stages that depend on it — reporting a lot of green for very little work.
 *
 * Deliberately not `dotenv`: this is fifteen lines against a new dependency,
 * and the ladder in restyle-yagni says rung 7 wins. Existing process
 * environment always takes precedence, so CI secrets are never overwritten by
 * a stray file.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Later files win over earlier ones, matching Next's own precedence. */
const FILES = ['.env', '.env.local'];

export function loadEnv(cwd = process.cwd()): string[] {
  const loaded: string[] = [];

  for (const file of FILES) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;

    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;

      const eq = line.indexOf('=');
      if (eq < 1) continue;

      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // A real environment variable beats a file, always.
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(file);
  }
  return loaded;
}
