-- ai_course_jobs queue for async AI generation (browser never calls edge)
create table if not exists public.ai_course_jobs (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  grade text not null,
  items_per_group integer not null check (items_per_group between 1 and 100),
  mode text not null check (mode in ('options','numeric')),
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  result_path text,
  error text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_course_jobs enable row level security;

-- Allow job owners to select their own rows
create policy ai_jobs_select_own
  on public.ai_course_jobs
  for select
  using (created_by = auth.uid());

-- Allow authenticated users to insert jobs for themselves
create policy ai_jobs_insert_self
  on public.ai_course_jobs
  for insert
  with check (created_by = auth.uid());

-- Allow owners to see status updates
create policy ai_jobs_update_self_status
  on public.ai_course_jobs
  for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Service role will process jobs; grant to service via default bypass of RLS for service key

create index if not exists ai_course_jobs_status_idx on public.ai_course_jobs(status);

-- Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists ai_course_jobs_set_updated_at on public.ai_course_jobs;
create trigger ai_course_jobs_set_updated_at
before update on public.ai_course_jobs
for each row execute function public.set_updated_at();

