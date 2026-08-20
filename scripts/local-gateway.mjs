/**
 * Local Supabase-compatible gateway. Development and test only — never
 * deployed, never imported by application code.
 *
 * Fronts three things on one origin so that @supabase/supabase-js works
 * unmodified against a local database:
 *   /rest/v1/*     -> the real PostgREST binary (so RLS is genuinely enforced)
 *   /auth/v1/*     -> a minimal GoTrue-compatible shim (email + password)
 *   /storage/v1/*  -> a file-backed object store
 *
 * Why the real PostgREST rather than a fake API: RLS is the defect class that
 * actually matters here (the system being replaced had none), and only the
 * real thing proves the policies hold. [D-26]
 */
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import pg from 'pg';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const POSTGREST = process.env.POSTGREST_URL ?? 'http://127.0.0.1:54322';
const JWT_SECRET = process.env.LOCAL_JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const STORAGE_ROOT = process.env.STORAGE_ROOT ?? join(process.cwd(), '.local-stack', 'storage');

if (!JWT_SECRET || !DATABASE_URL) {
  console.error('LOCAL_JWT_SECRET and DATABASE_URL are required.');
  process.exit(1);
}

const secret = new TextEncoder().encode(JWT_SECRET);
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });

// --- password hashing (scrypt; this store never leaves a dev machine) --------
const hashPassword = (pw) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
};
const verifyPassword = (pw, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, key] = stored.split(':');
  const a = Buffer.from(key, 'hex');
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
};

// --- JWTs with the same claim shape Supabase issues -------------------------
async function mintAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    aud: 'authenticated',
    app_metadata: user.raw_app_meta_data ?? {},
    user_metadata: user.raw_user_meta_data ?? {},
    session_id: randomUUID(),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(secret);
}

const toSessionUser = (u) => ({
  id: u.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: u.email,
  email_confirmed_at: u.email_confirmed_at,
  confirmed_at: u.email_confirmed_at,
  phone: '',
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'], ...(u.raw_app_meta_data ?? {}) },
  user_metadata: u.raw_user_meta_data ?? {},
  identities: [],
  created_at: u.created_at,
  updated_at: u.updated_at,
});

async function buildSession(user) {
  const access_token = await mintAccessToken(user);
  return {
    access_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `local-${user.id}`,
    user: toSessionUser(user),
  };
}

// --- helpers ----------------------------------------------------------------
const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': '*',
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

const authError = (res, msg, status = 400) =>
  json(res, status, { error: 'invalid_grant', error_description: msg, msg, message: msg });

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
};

// --- auth -------------------------------------------------------------------
async function handleAuth(req, res, url) {
  const path = url.pathname.replace('/auth/v1', '');

  if (path === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const body = JSON.parse((await readBody(req)).toString() || '{}');

    if (grant === 'refresh_token') {
      const id = String(body.refresh_token ?? '').replace('local-', '');
      const { rows } = await pool.query('select * from auth.users where id = $1', [id]);
      if (!rows[0]) return authError(res, 'Invalid Refresh Token', 401);
      return json(res, 200, await buildSession(rows[0]));
    }

    const { rows } = await pool.query('select * from auth.users where lower(email) = lower($1)', [
      body.email ?? '',
    ]);
    const user = rows[0];
    if (!user || !verifyPassword(body.password ?? '', user.encrypted_password)) {
      return authError(res, 'Invalid login credentials', 400);
    }
    return json(res, 200, await buildSession(user));
  }

  if (path === '/signup' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const existing = await pool.query('select id from auth.users where lower(email)=lower($1)', [
      body.email ?? '',
    ]);
    if (existing.rows.length) return authError(res, 'User already registered', 422);

    const { rows } = await pool.query(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data)
       values ($1, $2, $3) returning *`,
      [body.email, hashPassword(body.password ?? ''), JSON.stringify(body.data ?? {})],
    );
    return json(res, 200, await buildSession(rows[0]));
  }

  if (path === '/user' && (req.method === 'GET' || req.method === 'PUT')) {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    try {
      const { payload } = await jwtVerify(token, secret);
      const { rows } = await pool.query('select * from auth.users where id = $1', [payload.sub]);
      if (!rows[0]) return authError(res, 'User not found', 404);
      return json(res, 200, toSessionUser(rows[0]));
    } catch {
      return authError(res, 'invalid claim: missing sub claim', 401);
    }
  }

  // Admin API used by db/seed.ts. Mirrors supabase.auth.admin.createUser so the
  // seed script is identical against the local stack and against Supabase.
  if (path === '/admin/users' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const existing = await pool.query('select * from auth.users where lower(email)=lower($1)', [
      body.email ?? '',
    ]);
    if (existing.rows[0]) {
      const { rows } = await pool.query(
        `update auth.users
            set encrypted_password = $2, raw_user_meta_data = $3, updated_at = now()
          where id = $1 returning *`,
        [existing.rows[0].id, hashPassword(body.password ?? ''), JSON.stringify(body.user_metadata ?? {})],
      );
      return json(res, 200, toSessionUser(rows[0]));
    }
    const { rows } = await pool.query(
      `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
       values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, now()) returning *`,
      [body.id ?? null, body.email, hashPassword(body.password ?? ''), JSON.stringify(body.user_metadata ?? {})],
    );
    return json(res, 200, toSessionUser(rows[0]));
  }

  if (path.startsWith('/admin/users/') && req.method === 'DELETE') {
    const id = path.replace('/admin/users/', '');
    await pool.query('delete from auth.users where id = $1', [id]);
    return json(res, 200, {});
  }

  if (path === '/logout') return res.writeHead(204).end();

  // Google OAuth is production-only; the e2e suite authenticates with a
  // password against this shim. [D-30]
  if (path === '/authorize') {
    return json(res, 501, { message: 'OAuth is not available in the local stack. Use email + password.' });
  }

  return json(res, 404, { message: `local auth shim: unhandled ${req.method} ${path}` });
}

// --- storage ----------------------------------------------------------------
async function handleStorage(req, res, url) {
  const path = url.pathname.replace('/storage/v1', '');

  // Public read: /object/public/<bucket>/<key...>
  if (req.method === 'GET' && path.startsWith('/object/public/')) {
    const key = decodeURIComponent(path.replace('/object/public/', ''));
    const file = join(STORAGE_ROOT, key);
    if (!file.startsWith(STORAGE_ROOT) || !existsSync(file)) {
      return json(res, 404, { message: 'Object not found' });
    }
    const buf = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=3600',
      'access-control-allow-origin': '*',
    });
    return res.end(buf);
  }

  // Upload: POST/PUT /object/<bucket>/<key...>
  if ((req.method === 'POST' || req.method === 'PUT') && path.startsWith('/object/')) {
    const key = decodeURIComponent(path.replace('/object/', ''));
    const [bucket, ...rest] = key.split('/');
    const objectName = rest.join('/');
    const file = join(STORAGE_ROOT, key);
    if (!file.startsWith(STORAGE_ROOT)) return json(res, 400, { message: 'Invalid path' });

    const buf = await readBody(req);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, buf);

    await pool.query(
      `insert into storage.objects (bucket_id, name, metadata)
       values ($1, $2, $3)
       on conflict (bucket_id, name) do update set metadata = excluded.metadata`,
      [bucket, objectName, JSON.stringify({ size: buf.length })],
    );
    return json(res, 200, { Id: randomUUID(), Key: key });
  }

  if (req.method === 'DELETE' && path.startsWith('/object/')) {
    const key = decodeURIComponent(path.replace('/object/', ''));
    const [bucket, ...rest] = key.split('/');
    await pool.query('delete from storage.objects where bucket_id=$1 and name=$2', [
      bucket, rest.join('/'),
    ]);
    return json(res, 200, { message: 'Successfully deleted' });
  }

  return json(res, 404, { message: `local storage shim: unhandled ${req.method} ${path}` });
}

// --- PostgREST proxy --------------------------------------------------------
async function handleRest(req, res, url) {
  const target = POSTGREST + url.pathname.replace('/rest/v1', '') + url.search;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];
  delete headers.apikey;

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);

  const upstream = await fetch(target, { method: req.method, headers, body });
  const buf = Buffer.from(await upstream.arrayBuffer());
  const out = Object.fromEntries(upstream.headers.entries());
  delete out['content-encoding'];
  delete out['content-length'];
  out['access-control-allow-origin'] = '*';
  out['access-control-expose-headers'] = '*';
  res.writeHead(upstream.status, out);
  res.end(buf);
}

// --- server -----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    return res
      .writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': '*',
      })
      .end();
  }

  try {
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/storage/v1')) return await handleStorage(req, res, url);
    if (url.pathname.startsWith('/rest/v1')) return await handleRest(req, res, url);
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    return json(res, 404, { message: 'not found' });
  } catch (err) {
    console.error('[gateway]', err);
    return json(res, 500, { message: String(err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[gateway] listening on http://127.0.0.1:${PORT}`);
});
