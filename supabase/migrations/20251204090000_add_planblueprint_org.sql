alter table if exists public.planblueprints
  add column if not exists organization_id uuid;

create index if not exists planblueprints_org_idx on public.planblueprints (organization_id);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'planblueprints'
      and policyname = 'planblueprints_select_org'
  ) then
    execute 'drop policy if exists "Enable read access for all users" on public.planblueprints';
    execute 'drop policy if exists "Enable insert access for all users" on public.planblueprints';
    execute 'drop policy if exists "Enable update access for all users" on public.planblueprints';
    execute 'alter table public.planblueprints enable row level security';
    execute $policy$
      create policy planblueprints_select_org
        on public.planblueprints
        for select
        using (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
    $policy$;
    execute $policy$
      create policy planblueprints_mutation_org
        on public.planblueprints
        for insert
        with check (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
    $policy$;
    execute $policy$
      create policy planblueprints_update_org
        on public.planblueprints
        for update
        using (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
        with check (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
    $policy$;
  end if;
end
$$;




