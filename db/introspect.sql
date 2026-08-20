-- Object-level inventory of the public + private schemas.
--
-- One line per object, deterministic order, so the same text can be run against
-- a local reference database and against the remote project and the two outputs
-- diffed line by line. This is what makes "the schema matches" a measurement
-- rather than a claim. See docs/RECONCILIATION.md.
--
--   psql "$LOCAL_URL" -tA -f db/introspect.sql | sort > local.txt
--   # remote: same SQL via the Supabase MCP, extracted to remote.txt
--   diff local.txt remote.txt
--
-- Covers: tables and views, columns (type/nullability/default), constraints,
-- indexes, enums, functions (signature, return, security mode, body hash),
-- policies, the RLS flag, triggers, and the table/column/function grants held
-- by anon, authenticated and service_role.
select regexp_replace(line, '[[:space:]]+', ' ', 'g') as obj from (
select 'TABLE|' || c.relname || '|' || case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' end as line
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','v','m')
   and c.relname not in ('_migrations')
union all
select 'COLUMN|' || c.relname || '|' || a.attname || '|' || format_type(a.atttypid, a.atttypmod)
       || '|' || case when a.attnotnull then 'NOT NULL' else 'NULL' end
       || '|' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 where n.nspname='public' and c.relkind in ('r','v') and c.relname <> '_migrations'
union all
select 'CONSTRAINT|' || c.relname || '|' || con.conname || '|' || con.contype::text || '|' || pg_get_constraintdef(con.oid)
  from pg_constraint con join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname <> '_migrations'
union all
select 'INDEX|' || tablename || '|' || indexname || '|' || regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX [^ ]+ ', 'CREATE \1INDEX ')
  from pg_indexes where schemaname='public' and tablename <> '_migrations'
union all
select 'ENUM|' || t.typname || '|' || string_agg(e.enumlabel, ',' order by e.enumsortorder)
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'
 group by t.typname
union all
select 'FUNCTION|' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       || '|returns ' || pg_get_function_result(p.oid)
       || '|' || case when p.prosecdef then 'DEFINER' else 'INVOKER' end
       || '|' || md5(p.prosrc)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private')
   and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all
select 'POLICY|' || c.relname || '|' || pol.polname
       || '|' || case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end
       || '|' || coalesce((select string_agg(rolname, ',' order by rolname) from pg_roles where oid = any(pol.polroles)), 'PUBLIC')
       || '|using=' || coalesce(pg_get_expr(pol.polqual, pol.polrelid), '-')
       || '|check=' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '-')
  from pg_policy pol join pg_class c on c.oid=pol.polrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
union all
select 'RLS|' || c.relname || '|' || case when c.relrowsecurity then 'enabled' else 'DISABLED' end
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname <> '_migrations'
union all
select 'TRIGGER|' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and not t.tgisinternal
union all
-- Table-level privileges for the API roles: this is where D-45 lives.
select 'TABLEGRANT|' || table_name || '|' || grantee || '|' || string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema='public' and grantee in ('anon','authenticated','service_role')
   and table_name <> '_migrations'
 group by table_name, grantee
union all
select 'COLGRANT|' || table_name || '|' || grantee || '|' || privilege_type || '|' || string_agg(column_name, ',' order by column_name)
  from information_schema.column_privileges
 where table_schema='public' and grantee in ('anon','authenticated','service_role')
   and table_name <> '_migrations'
 group by table_name, grantee, privilege_type
union all
select 'FUNCGRANT|' || n.nspname || '.' || p.proname || '|' || r.rolname
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join (select rolname from pg_roles where rolname in ('anon','authenticated','service_role')) r
 where n.nspname in ('public','private')
   and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
   and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
) t order by 1;
