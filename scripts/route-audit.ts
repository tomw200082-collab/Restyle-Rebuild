/**
 * Public route audit — status, metadata, canonical, JSON-LD, one row per route.
 *
 *   npm run route-audit -- --base-url=http://127.0.0.1:3210
 *
 * Writes quality/route-audit.md.
 *
 * This exists because of [D-49]. `/sitemap.xml` returned 404 — the one URL
 * robots.txt points at and every crawler tries first — and nothing noticed,
 * because nothing in the application ever requests it. The gate's status-code
 * stage covers the codes; this covers what a crawler reads once it has one.
 *
 * Read-only. It fetches and reports; it never edits.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadEnv } from './release-gate/env';
import { staticRoutes, dynamicRoutes, type PublicRoute } from './release-gate/routes';

const ROOT = process.cwd();
const OUT = join(ROOT, 'quality', 'route-audit.md');

/** Google truncates around here; longer is not wrong, but it is not read. */
const DESCRIPTION_MAX = 160;

type Row = {
  route: PublicRoute;
  status: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  jsonLdTypes: string[];
  findings: string[];
};

function firstMatch(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m?.[1]?.trim() ?? null;
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function jsonLdTypes(html: string): string[] {
  const types: string[] = [];
  for (const [, raw] of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const parsed = JSON.parse(raw ?? '') as unknown;
      const blocks = Array.isArray(parsed) ? parsed : [parsed];
      for (const block of blocks) {
        const type = (block as { '@type'?: unknown })['@type'];
        if (typeof type === 'string') types.push(type);
        else if (Array.isArray(type)) types.push(...type.map(String));
      }
    } catch {
      types.push('INVALID-JSON');
    }
  }
  return types;
}

/** What each template is expected to emit. Absence is a finding. */
const EXPECTED_JSONLD: Record<string, string[]> = {
  home: ['Organization', 'WebSite'],
  'item/[slug]': ['Product'],
  'category/[slug]': ['ItemList'],
  'category/[slug]/[city]': ['ItemList'],
  'brand/[slug]': ['ItemList'],
};

async function audit(baseUrl: string, route: PublicRoute): Promise<Row> {
  const findings: string[] = [];
  const url = `${baseUrl}${route.path}`;

  let status = 0;
  let html = '';
  try {
    const response = await fetch(url, { redirect: 'manual' });
    status = response.status;
    if (response.headers.get('content-type')?.includes('html')) html = await response.text();
  } catch (error) {
    findings.push(`request failed: ${(error as Error).message}`);
  }

  if (status !== route.expectedStatus) {
    findings.push(`status ${status}, expected ${route.expectedStatus}`);
  }

  const title = html ? decode(firstMatch(html, /<title>([\s\S]*?)<\/title>/) ?? '') || null : null;
  const description = html
    ? decode(firstMatch(html, /<meta name="description" content="([^"]*)"/) ?? '') || null
    : null;
  const canonical = html ? firstMatch(html, /<link rel="canonical" href="([^"]*)"/) : null;
  const types = html ? jsonLdTypes(html) : [];

  // Metadata is only expected where a page renders for an anonymous visitor.
  if (status === 200 && html) {
    if (!title) findings.push('no <title>');
    if (!description) findings.push('no meta description');
    else if (description.length > DESCRIPTION_MAX) {
      findings.push(`description ${description.length} chars (>${DESCRIPTION_MAX})`);
    }
    // A noindex page needs no canonical, and giving it one is contradictory
    // signalling — the page says "do not index me" and then nominates itself as
    // the version to index. Only indexable pages are held to the rule.
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
    if (!canonical && !noindex) findings.push('no canonical');
    else if (canonical) {
      const canonicalPath = (() => {
        try {
          return new URL(canonical, baseUrl).pathname;
        } catch {
          return canonical;
        }
      })();
      if (decodeURIComponent(canonicalPath) !== decodeURIComponent(route.path)) {
        findings.push(`canonical points at ${canonicalPath}, not ${route.path}`);
      }
    }

    for (const expected of EXPECTED_JSONLD[route.template] ?? []) {
      if (!types.includes(expected)) findings.push(`missing JSON-LD ${expected}`);
    }
    if (types.includes('INVALID-JSON')) findings.push('a JSON-LD block does not parse');

    // Hebrew UI. A Latin-only title is untranslated metadata, and it is what a
    // Hebrew speaker sees in the search result. CLAUDE.md §3.5.
    for (const [label, value] of [
      ['title', title],
      ['description', description],
    ] as const) {
      if (value && !/[֐-׿]/.test(value) && /[A-Za-z]{3,}/.test(value)) {
        findings.push(`${label} has no Hebrew: "${value.slice(0, 60)}"`);
      }
    }
  }

  return { route, status, title, description, canonical, jsonLdTypes: types, findings };
}

function cell(value: string | null, max = 48): string {
  if (!value) return '—';
  const clean = value.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function main() {
  loadEnv();

  const baseArg = process.argv.find((a) => a.startsWith('--base-url='));
  const baseUrl = (baseArg?.split('=')[1] ?? 'http://127.0.0.1:3210').replace(/\/$/, '');

  if (existsSync(join(ROOT, 'ops', 'KILL_SWITCH')) || process.env.KILL_SWITCH) {
    console.error('ops/KILL_SWITCH is present — halting without auditing.');
    process.exit(2);
  }

  const statics = await staticRoutes();
  const sample = await dynamicRoutes();
  const routes = [...statics, ...sample.routes];

  const rows: Row[] = [];
  for (const route of routes) rows.push(await audit(baseUrl, route));

  const flagged = rows.filter((r) => r.findings.length);
  const lines: string[] = [
    '# Route audit',
    '',
    `_${new Date().toISOString()} · ${baseUrl} · target ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'unknown'}_`,
    '',
    `${rows.length} routes audited — ${rows.length - flagged.length} clean, ${flagged.length} flagged.`,
    '',
    '## Findings',
    '',
  ];

  if (!flagged.length) {
    lines.push('None. Every route returned its expected status with a title, a description, a self-referencing canonical, and the JSON-LD its template calls for.', '');
  } else {
    for (const row of flagged) {
      lines.push(`### \`${row.route.path}\``, '');
      for (const finding of row.findings) lines.push(`- ${finding}`);
      lines.push('');
    }
  }

  lines.push('## Every route', '', '| route | status | title | description | canonical | JSON-LD |', '|---|---|---|---|---|---|');
  for (const row of rows) {
    lines.push(
      `| \`${row.route.path}\` | ${row.status}${row.status === row.route.expectedStatus ? '' : ' ⚠'} | ${cell(row.title)} | ${cell(row.description, 60)} | ${cell(row.canonical, 40)} | ${row.jsonLdTypes.join(', ') || '—'} |`,
    );
  }
  lines.push('');

  await mkdir(join(ROOT, 'quality'), { recursive: true });
  await writeFile(OUT, lines.join('\n'), 'utf8');

  console.log(`${rows.length} routes audited, ${flagged.length} flagged.`);
  console.log(`evidence: ${relative(ROOT, OUT)}`);
  process.exit(flagged.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
