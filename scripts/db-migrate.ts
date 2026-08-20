/**
 * Migration runner. Applies supabase/migrations/*.sql in filename order,
 * recording each in public._migrations so a re-run is a no-op.
 *
 * Used for the local database. The remote Supabase project receives the same
 * files through the Supabase MCP / CLI — see docs/POST_RUN_HOOKUP.md.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

export async function migrate(connectionString: string, opts: { bootstrap?: string } = {}) {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    if (opts.bootstrap) {
      const sql = await readFile(opts.bootstrap, 'utf8');
      await client.query(sql);
      console.log(`bootstrap  ${opts.bootstrap.split('/').pop()}`);
    }

    await client.query(`
      create table if not exists public._migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (await client.query<{ name: string }>('select name from public._migrations')).rows.map(
        (r) => r.name,
      ),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip       ${file}`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      // Each migration is one transaction: a failure leaves no partial schema.
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into public._migrations (name) values ($1)', [file]);
        await client.query('commit');
        console.log(`applied    ${file}`);
        count += 1;
      } catch (err) {
        await client.query('rollback');
        console.error(`FAILED     ${file}`);
        throw err;
      }
    }

    console.log(`\n${count} migration(s) applied, ${files.length - count} already present.`);
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1]?.endsWith('db-migrate.ts');
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }
  const bootstrap = process.env.DB_BOOTSTRAP;
  migrate(url, bootstrap ? { bootstrap } : {}).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
