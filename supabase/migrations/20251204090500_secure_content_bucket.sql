drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated Insert" on storage.objects;

-- Ensure service role retains full access (policy already exists in base migration).
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Content service role'
  ) then
    perform null;
  end if;
end
$$;




