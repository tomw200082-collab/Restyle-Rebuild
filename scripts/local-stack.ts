/**
 * Brings the local Supabase-compatible stack up and down.
 *
 *   npm run stack:up     PostgREST + gateway, and writes .env.development.local
 *   npm run stack:down   stops both
 *
 * Development and test only. On Vercel the app talks to the real Supabase
 * project and none of this exists. See docs/POST_RUN_HOOKUP.md.
 */
import { spawn, execSync } from 'node:child_process';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';

const ROOT = process.cwd();
const STACK_DIR = join(ROOT, '.local-stack');
const CONFIG_PATH = join(STACK_DIR, 'config.json');
const POSTGREST_BIN = process.env.POSTGREST_BIN ?? '/opt/restyle-local/postgrest';

const GATEWAY_PORT = 54321;
const POSTGREST_PORT = 54322;
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/restyle';
const AUTHENTICATOR_URL = DATABASE_URL.replace('postgres:postgres@', 'authenticator:postgres@');

type StackConfig = { jwtSecret: string; anonKey: string; serviceKey: string };

async function loadOrCreateConfig(): Promise<StackConfig> {
  await mkdir(STACK_DIR, { recursive: true });
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as StackConfig;
  }

  // PostgREST authenticates callers by verifying this HS256 signature, exactly
  // as Supabase does, so the anon and service keys are real JWTs.
  const jwtSecret = randomBytes(32).toString('hex');
  const secret = new TextEncoder().encode(jwtSecret);
  const sign = (role: string) =>
    new SignJWT({ role, iss: 'restyle-local' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('10y')
      .sign(secret);

  const config: StackConfig = {
    jwtSecret,
    anonKey: await sign('anon'),
    serviceKey: await sign('service_role'),
  };
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

async function up() {
  if (!existsSync(POSTGREST_BIN)) {
    console.error(
      `PostgREST binary not found at ${POSTGREST_BIN}.\n` +
        'Download it from https://github.com/PostgREST/postgrest/releases and set POSTGREST_BIN.',
    );
    process.exit(1);
  }

  const config = await loadOrCreateConfig();
  await mkdir(join(STACK_DIR, 'storage'), { recursive: true });

  await writeFile(
    join(STACK_DIR, 'postgrest.conf'),
    [
      `db-uri = "${AUTHENTICATOR_URL}"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `jwt-secret = "${config.jwtSecret}"`,
      `server-port = ${POSTGREST_PORT}`,
      'server-host = "127.0.0.1"',
      'db-pool = 10',
      'openapi-mode = "ignore-privileges"',
    ].join('\n') + '\n',
  );

  down({ quiet: true });

  const postgrest = spawn(POSTGREST_BIN, [join(STACK_DIR, 'postgrest.conf')], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  postgrest.unref();
  await writeFile(join(STACK_DIR, 'postgrest.pid'), String(postgrest.pid));

  const gateway = spawn(process.execPath, [join(ROOT, 'scripts', 'local-gateway.mjs')], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: {
      ...process.env,
      GATEWAY_PORT: String(GATEWAY_PORT),
      POSTGREST_URL: `http://127.0.0.1:${POSTGREST_PORT}`,
      LOCAL_JWT_SECRET: config.jwtSecret,
      DATABASE_URL,
      STORAGE_ROOT: join(STACK_DIR, 'storage'),
    },
  });
  gateway.unref();
  await writeFile(join(STACK_DIR, 'gateway.pid'), String(gateway.pid));

  // .env.development.local overrides .env.local in dev and test, so the app
  // points at the local stack here while .env.local keeps the real project
  // values for Vercel. Both are gitignored.
  const envBody = [
    '# Written by `npm run stack:up`. Local development only — gitignored.',
    '# Overrides .env.local so the app talks to the local Supabase-compatible stack.',
    `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${GATEWAY_PORT}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${config.anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${config.serviceKey}`,
    `DATABASE_URL=${DATABASE_URL}`,
    '',
  ].join('\n');
  await writeFile(join(ROOT, '.env.development.local'), envBody);
  await writeFile(join(ROOT, '.env.test.local'), envBody);

  await waitForHealth();
  console.log(`gateway    http://127.0.0.1:${GATEWAY_PORT}`);
  console.log(`postgrest  http://127.0.0.1:${POSTGREST_PORT}`);
  console.log('env        .env.development.local, .env.test.local');
}

async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/health`);
      if (res.ok) {
        const rest = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/rest/v1/categories?limit=1`, {
          headers: { apikey: 'x' },
        });
        if (rest.status < 500) return;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('local stack did not become healthy within 10s');
}

function down({ quiet = false } = {}) {
  for (const name of ['postgrest', 'gateway']) {
    const pidFile = join(STACK_DIR, `${name}.pid`);
    if (!existsSync(pidFile)) continue;
    try {
      const pid = Number(execSync(`cat ${pidFile}`).toString().trim());
      process.kill(pid, 'SIGTERM');
      if (!quiet) console.log(`stopped ${name} (pid ${pid})`);
    } catch {
      /* already gone */
    }
  }
  try {
    execSync(`pkill -f "${POSTGREST_BIN}" || true`, { stdio: 'ignore' });
    execSync('pkill -f "local-gateway.mjs" || true', { stdio: 'ignore' });
  } catch {
    /* nothing running */
  }
}

const cmd = process.argv[2] ?? 'up';
if (cmd === 'down') {
  down();
} else {
  up().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
