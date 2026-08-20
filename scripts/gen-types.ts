/**
 * Generates src/types/database.ts by introspecting Postgres directly.
 *
 * The Supabase CLI's `gen types` needs a Docker daemon to run pg-meta, which
 * this environment does not have, so this reads the catalog itself and emits
 * the same `Database` shape @supabase/supabase-js expects.
 *
 * Run after EVERY migration and commit the result in the same commit — a
 * generated type file that lags its schema type-checks against a table shape
 * that no longer exists.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

type Column = {
  table_name: string;
  column_name: string;
  is_nullable: 'YES' | 'NO';
  has_default: boolean;
  is_identity: 'YES' | 'NO';
  is_generated: string;
  data_type: string;
  udt_name: string;
};

const SCALARS: Record<string, string> = {
  uuid: 'string', text: 'string', varchar: 'string', bpchar: 'string', citext: 'string',
  int2: 'number', int4: 'number', int8: 'number', float4: 'number', float8: 'number',
  numeric: 'number', money: 'number',
  bool: 'boolean',
  json: 'Json', jsonb: 'Json',
  date: 'string', time: 'string', timetz: 'string', timestamp: 'string', timestamptz: 'string',
  interval: 'string', bytea: 'string', inet: 'string', cidr: 'string', macaddr: 'string',
};

function tsType(col: Column, enums: Set<string>): string {
  const udt = col.udt_name;

  // Array types are prefixed with an underscore in pg_type.
  if (udt.startsWith('_')) {
    const inner = udt.slice(1);
    const base = enums.has(inner)
      ? `Database["public"]["Enums"]["${inner}"]`
      : (SCALARS[inner] ?? 'string');
    return `${base}[]`;
  }

  if (enums.has(udt)) return `Database["public"]["Enums"]["${udt}"]`;
  return SCALARS[udt] ?? 'string';
}

const quoteKey = (name: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `"${name}"`);

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const { rows: enumRows } = await client.query<{ name: string; values: string[] }>(`
    select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as values
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
     group by t.typname
     order by t.typname
  `);
  const enumNames = new Set(enumRows.map((e) => e.name));

  const { rows: relRows } = await client.query<{ name: string; kind: 'r' | 'v' | 'm' }>(`
    select c.relname as name, c.relkind as kind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'v', 'm')
       and c.relname not like '\\_%'
     order by c.relname
  `);

  // Foreign keys become the `Relationships` entries supabase-js uses to
  // resolve embedded selects like `listings(*, listing_photos(*))`. Without
  // them every embed type-checks as SelectQueryError.
  const { rows: fkRows } = await client.query<{
    conname: string;
    table_name: string;
    referenced_relation: string;
    columns: string[];
    referenced_columns: string[];
    is_one_to_one: boolean;
  }>(`
    select c.conname,
           src.relname as table_name,
           tgt.relname as referenced_relation,
           (select array_agg(a.attname::text order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
             as columns,
           (select array_agg(a.attname::text order by k.ord)
              from unnest(c.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
             as referenced_columns,
           exists (
             select 1 from pg_constraint u
              where u.conrelid = c.conrelid
                and u.contype in ('p', 'u')
                and u.conkey @> c.conkey and c.conkey @> u.conkey
           ) as is_one_to_one
      from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class tgt on tgt.oid = c.confrelid
      join pg_namespace n on n.oid = src.relnamespace
     where c.contype = 'f' and n.nspname = 'public'
     order by src.relname, c.conname
  `);

  const fksByTable = new Map<string, typeof fkRows>();
  for (const fk of fkRows) {
    const list = fksByTable.get(fk.table_name) ?? [];
    list.push(fk);
    fksByTable.set(fk.table_name, list);
  }

  const renderRelationships = (table: string) => {
    const fks = fksByTable.get(table) ?? [];
    if (fks.length === 0) return '        Relationships: []';
    const entries = fks
      .map(
        (fk) => `          {
            foreignKeyName: "${fk.conname}"
            columns: [${fk.columns.map((c) => `"${c}"`).join(', ')}]
            isOneToOne: ${fk.is_one_to_one}
            referencedRelation: "${fk.referenced_relation}"
            referencedColumns: [${fk.referenced_columns.map((c) => `"${c}"`).join(', ')}]
          }`,
      )
      .join(',\n');
    return `        Relationships: [\n${entries}\n        ]`;
  };

  const { rows: colRows } = await client.query<Column>(`
    select c.table_name, c.column_name, c.is_nullable,
           (c.column_default is not null) as has_default,
           c.is_identity, c.is_generated, c.data_type, c.udt_name
      from information_schema.columns c
     where c.table_schema = 'public'
     order by c.table_name, c.ordinal_position
  `);

  const byTable = new Map<string, Column[]>();
  for (const col of colRows) {
    const list = byTable.get(col.table_name) ?? [];
    list.push(col);
    byTable.set(col.table_name, list);
  }

  const tables = relRows.filter((r) => r.kind === 'r').map((r) => r.name);
  const views = relRows.filter((r) => r.kind !== 'r').map((r) => r.name);

  const renderRow = (cols: Column[]) =>
    cols
      .map((c) => {
        const type = tsType(c, enumNames);
        const nullable = c.is_nullable === 'YES' ? ' | null' : '';
        return `          ${quoteKey(c.column_name)}: ${type}${nullable}`;
      })
      .join('\n');

  const renderInsert = (cols: Column[]) =>
    cols
      .map((c) => {
        const type = tsType(c, enumNames);
        const nullable = c.is_nullable === 'YES' ? ' | null' : '';
        const optional =
          c.is_nullable === 'YES' || c.has_default || c.is_identity === 'YES' || c.is_generated !== 'NEVER'
            ? '?'
            : '';
        return `          ${quoteKey(c.column_name)}${optional}: ${type}${nullable}`;
      })
      .join('\n');

  const renderUpdate = (cols: Column[]) =>
    cols
      .map((c) => {
        const type = tsType(c, enumNames);
        const nullable = c.is_nullable === 'YES' ? ' | null' : '';
        return `          ${quoteKey(c.column_name)}?: ${type}${nullable}`;
      })
      .join('\n');

  const tableBlocks = tables
    .map((t) => {
      const cols = byTable.get(t) ?? [];
      return `      ${quoteKey(t)}: {
        Row: {
${renderRow(cols)}
        }
        Insert: {
${renderInsert(cols)}
        }
        Update: {
${renderUpdate(cols)}
        }
${renderRelationships(t)}
      }`;
    })
    .join('\n');

  const viewBlocks = views
    .map((v) => {
      const cols = byTable.get(v) ?? [];
      return `      ${quoteKey(v)}: {
        Row: {
${renderRow(cols)}
        }
        Relationships: []
      }`;
    })
    .join('\n');

  const enumBlocks = enumRows
    .map((e) => `      ${quoteKey(e.name)}: ${e.values.map((v) => `"${v}"`).join(' | ')}`)
    .join('\n');

  const body = `// Generated by \`npm run db:types\` from the live schema. Do not edit by hand.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
${tableBlocks}
    }
    Views: {
${viewBlocks || '      [_ in never]: never'}
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
${enumBlocks || '      [_ in never]: never'}
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])> =
  (PublicSchema['Tables'] & PublicSchema['Views'])[T] extends { Row: infer R } ? R : never;

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T] extends { Insert: infer I } ? I : never;

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T] extends { Update: infer U } ? U : never;

export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
`;

  const target = join(process.cwd(), 'src', 'types', 'database.ts');
  writeFileSync(target, body);
  await client.end();

  console.log(
    `wrote ${target}\n  ${tables.length} tables, ${views.length} views, ` +
      `${enumRows.length} enums, ${fkRows.length} relationships`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
