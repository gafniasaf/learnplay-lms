-- Catalog Updates Table for Reliable Realtime Notifications
-- Solves the problem of courses not appearing after generation

-- Create catalog_updates table
create table if not exists public.catalog_updates (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  action text not null check (action in ('added', 'updated', 'deleted')),
  catalog_version integer not null,
  course_title text,
  updated_at timestamptz default now()
);

-- RLS: Anyone can view
alter table public.catalog_updates enable row level security;

create policy "Anyone can view catalog updates"
  on public.catalog_updates for select
  using (true);

-- Service role can insert
create policy "Service can insert updates"
  on public.catalog_updates for insert
  with check (true);

-- Enable realtime
alter publication supabase_realtime add table public.catalog_updates;

-- Create catalog version sequence
create sequence if not exists public.catalog_version_seq start with 1;

-- Function to get next catalog version
create or replace function public.get_next_catalog_version()
returns integer
language sql
as $$
  select nextval('public.catalog_version_seq')::integer;
$$;

-- Index for performance
create index if not exists catalog_updates_course_id_idx on public.catalog_updates(course_id);
create index if not exists catalog_updates_updated_at_idx on public.catalog_updates(updated_at desc);

comment on table public.catalog_updates is 'Tracks catalog changes for realtime UI updates - solves courses not appearing problem';
comment on column public.catalog_updates.catalog_version is 'Sequential version number for cache busting';
comment on column public.catalog_updates.action is 'Type of change: added, updated, or deleted';