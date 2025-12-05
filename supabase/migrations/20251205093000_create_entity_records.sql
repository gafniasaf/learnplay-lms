-- Dawn LMS unified entity storage
create extension if not exists "pgcrypto";

create table if not exists public.entity_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity text not null,
  title text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entity_records_org_entity_idx
  on public.entity_records (organization_id, entity);

create index if not exists entity_records_entity_updated_idx
  on public.entity_records (entity, updated_at desc);

alter table public.entity_records enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'entity_records'
      and policyname = 'entity_records_access_policy'
  ) then
    create policy entity_records_access_policy
      on public.entity_records
      using (true)
      with check (true);
  end if;
end $$;




