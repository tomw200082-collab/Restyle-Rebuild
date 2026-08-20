-- 0012 — storage bucket and policies.
-- Guarded so the same migration runs against a plain Postgres (local dev,
-- where the storage schema is provided by a shim) and against Supabase.

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema absent — skipping bucket policies (local dev)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('listing-photos', 'listing-photos', true, 5242880,
          array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end $$;

-- Path convention: <user_id>/<listing_id>/<filename>. The first path segment
-- is the owner, which is what makes own-folder write enforceable.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    return;
  end if;

  execute $p$drop policy if exists "listing photos public read" on storage.objects$p$;
  execute $p$create policy "listing photos public read" on storage.objects
    for select to anon, authenticated using (bucket_id = 'listing-photos')$p$;

  execute $p$drop policy if exists "listing photos own folder insert" on storage.objects$p$;
  execute $p$create policy "listing photos own folder insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'listing-photos'
                and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute $p$drop policy if exists "listing photos own folder update" on storage.objects$p$;
  execute $p$create policy "listing photos own folder update" on storage.objects
    for update to authenticated
    using (bucket_id = 'listing-photos'
           and (storage.foldername(name))[1] = auth.uid()::text)$p$;

  execute $p$drop policy if exists "listing photos own folder delete" on storage.objects$p$;
  execute $p$create policy "listing photos own folder delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'listing-photos'
           and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;
