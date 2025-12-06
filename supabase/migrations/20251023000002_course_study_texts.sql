-- Optional: Course Study Texts metadata tracking
-- Study texts are embedded in course JSON but we track generation jobs here

create table if not exists public.study_text_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  source_type text not null check (source_type in ('upload', 'ai_research', 'from_exercises')),
  source_files text[],  -- URLs of uploaded source files
  ai_prompt text,  -- For AI research mode
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'dead_letter', 'stale')),
  result jsonb,  -- Generated study texts array
  error text,
  
  -- Job queue resilience fields
  idempotency_key text,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  last_heartbeat timestamptz,
  processing_duration_ms bigint,
  
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table public.study_text_generation_jobs enable row level security;

-- RLS policies
create policy study_text_jobs_select_own
  on public.study_text_generation_jobs
  for select
  using (created_by = auth.uid());

create policy study_text_jobs_insert_self
  on public.study_text_generation_jobs
  for insert
  with check (
    created_by = auth.uid()
    and public.check_ai_job_rate_limit(auth.uid())
  );

-- Indexes
create index study_text_jobs_status_idx on public.study_text_generation_jobs(status);
create index study_text_jobs_course_id_idx on public.study_text_generation_jobs(course_id);
create unique index study_text_jobs_idempotency_key_idx
  on public.study_text_generation_jobs(idempotency_key)
  where idempotency_key is not null;

-- Auto-update trigger
drop trigger if exists study_text_jobs_set_updated_at on public.study_text_generation_jobs;
create trigger study_text_jobs_set_updated_at
before update on public.study_text_generation_jobs
for each row execute function public.set_updated_at();

-- Enable realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'study_text_generation_jobs') then
    alter publication supabase_realtime add table public.study_text_generation_jobs;
  end if;
end $$;

comment on table public.study_text_generation_jobs is 
  'Queue for AI-generated study texts (reference materials) for courses';

-- Get next pending study text job (for runner)
create or replace function public.get_next_pending_study_text_job()
returns setof public.study_text_generation_jobs as $$
declare
  job_row public.study_text_generation_jobs;
begin
  select *
  into job_row
  from public.study_text_generation_jobs
  where (status = 'pending')
     or (status = 'failed' and retry_count < max_retries)
  order by created_at asc
  limit 1
  for update skip locked;
  
  if job_row.id is not null then
    if job_row.status = 'failed' then
      update public.study_text_generation_jobs
      set status = 'processing',
          started_at = now(),
          retry_count = retry_count + 1,
          last_heartbeat = now()
      where id = job_row.id;
    else
      update public.study_text_generation_jobs
      set status = 'processing',
          started_at = now(),
          last_heartbeat = now()
      where id = job_row.id;
    end if;
    
    return query
    select * from public.study_text_generation_jobs where id = job_row.id;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.get_next_pending_study_text_job to service_role;

comment on function public.get_next_pending_study_text_job is 
  'Atomically get and lock next pending/failed study text generation job with retry support';

