create table if not exists public.architect_plans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_name text,
  prompt text,
  plan jsonb not null,
  markdown_plan text,
  summary text,
  metadata jsonb
);

alter table public.architect_plans enable row level security;

create policy "architect_plans_select_service" on public.architect_plans
  for select
  using (auth.role() = 'service_role');

create policy "architect_plans_insert_service" on public.architect_plans
  for insert
  with check (auth.role() = 'service_role');

