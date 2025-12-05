create table if not exists public.consult_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mode text not null,
  prompt jsonb not null,
  response text not null,
  context jsonb,
  metadata jsonb
);

alter table public.consult_logs enable row level security;

create policy "consult_logs_select_service" on public.consult_logs
  for select
  using (auth.role() = 'service_role');

create policy "consult_logs_insert_service" on public.consult_logs
  for insert
  with check (auth.role() = 'service_role');

