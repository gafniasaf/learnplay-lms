-- Create table for PlanBlueprint metadata
create table if not exists public.planblueprints (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text default 'draft',
  storage_path text not null,
  ai_score integer default 0,
  last_guard_result text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.planblueprints enable row level security;

-- Create policies
create policy "Enable read access for all users" on public.planblueprints
  for select using (true);

create policy "Enable insert access for all users" on public.planblueprints
  for insert with check (true);

create policy "Enable update access for all users" on public.planblueprints
  for update using (true);

