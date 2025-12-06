-- Phase 1: Security and Observability Enhancements
-- Adds: idempotency, rate limiting, ai_media_jobs table with RLS

-- ========================================
-- 1. Add idempotency_key to ai_course_jobs
-- ========================================

alter table public.ai_course_jobs
  add column if not exists idempotency_key text;

-- Create unique index on idempotency_key to prevent duplicate job submissions
create unique index if not exists ai_course_jobs_idempotency_key_idx
  on public.ai_course_jobs(idempotency_key)
  where idempotency_key is not null;

-- Add additional progress tracking columns (already exist, but ensure presence)
alter table public.ai_course_jobs
  add column if not exists progress_stage text,
  add column if not exists progress_percent integer,
  add column if not exists progress_message text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

comment on column public.ai_course_jobs.idempotency_key is 'Client-generated unique key to prevent duplicate job submissions';
comment on column public.ai_course_jobs.progress_stage is 'Current stage of job processing';
comment on column public.ai_course_jobs.progress_percent is 'Progress percentage (0-100)';

-- ========================================
-- 2. Rate Limiting Function
-- ========================================

-- Function to check if user has exceeded job creation rate limit
create or replace function public.check_ai_job_rate_limit(user_id uuid)
returns boolean as $$
declare
  job_count integer;
begin
  -- Count jobs created by user in the last hour
  select count(*)
  into job_count
  from public.ai_course_jobs
  where created_by = user_id
    and created_at > now() - interval '1 hour';
  
  -- Return true if under limit (10 jobs per hour)
  return job_count < 10;
end;
$$ language plpgsql security definer set search_path = public;

comment on function public.check_ai_job_rate_limit is 'Check if user can create a new AI job (10 per hour limit)';

-- Update insert policy to enforce rate limiting
drop policy if exists ai_jobs_insert_self on public.ai_course_jobs;
drop policy if exists "teachers create jobs" on public.ai_course_jobs;

create policy ai_jobs_insert_self
  on public.ai_course_jobs
  for insert
  with check (
    created_by = auth.uid()
    and public.check_ai_job_rate_limit(auth.uid())
  );

-- ========================================
-- 3. Create ai_media_jobs table
-- ========================================

create table if not exists public.ai_media_jobs (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  item_id integer not null,
  media_type text not null check (media_type in ('image', 'audio', 'video')),
  prompt text not null,
  provider text check (provider in ('openai', 'elevenlabs', 'replicate')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  result_url text,
  metadata jsonb default '{}'::jsonb,
  error text,
  idempotency_key text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table public.ai_media_jobs enable row level security;

-- RLS policies for ai_media_jobs (drop first if exists to handle re-runs)
drop policy if exists ai_media_jobs_select_own on public.ai_media_jobs;
create policy ai_media_jobs_select_own
  on public.ai_media_jobs
  for select
  using (created_by = auth.uid());

drop policy if exists ai_media_jobs_insert_self on public.ai_media_jobs;
create policy ai_media_jobs_insert_self
  on public.ai_media_jobs
  for insert
  with check (
    created_by = auth.uid()
    and public.check_ai_job_rate_limit(auth.uid())
  );

drop policy if exists ai_media_jobs_update_self on public.ai_media_jobs;
create policy ai_media_jobs_update_self
  on public.ai_media_jobs
  for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Indexes for ai_media_jobs
create index if not exists ai_media_jobs_status_idx on public.ai_media_jobs(status);
create index if not exists ai_media_jobs_created_by_idx on public.ai_media_jobs(created_by);
create unique index if not exists ai_media_jobs_idempotency_key_idx
  on public.ai_media_jobs(idempotency_key)
  where idempotency_key is not null;

-- ========================================
-- 4. Create set_updated_at function if not exists
-- ========================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

-- Auto-update updated_at trigger
drop trigger if exists ai_media_jobs_set_updated_at on public.ai_media_jobs;
create trigger ai_media_jobs_set_updated_at
before update on public.ai_media_jobs
for each row execute function public.set_updated_at();

-- ========================================
-- 5. Enable Realtime for ai_media_jobs
-- ========================================

-- Only add if not already a member (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and tablename = 'ai_media_jobs'
  ) then
    alter publication supabase_realtime add table public.ai_media_jobs;
  end if;
end $$;

comment on table public.ai_media_jobs is 'Queue for AI-generated media (images, audio, video) attached to course items';
comment on column public.ai_media_jobs.idempotency_key is 'Client-generated unique key to prevent duplicate submissions';
comment on column public.ai_media_jobs.provider is 'AI provider used for generation (openai, elevenlabs, replicate)';

-- ========================================
-- 6. Get Next Pending Media Job Function (for runner)
-- ========================================

create or replace function public.get_next_pending_media_job()
returns setof public.ai_media_jobs as $$
declare
  job_row public.ai_media_jobs;
begin
  -- Select oldest pending job and lock it
  select *
  into job_row
  from public.ai_media_jobs
  where status = 'pending'
  order by created_at asc
  limit 1
  for update skip locked;
  
  if job_row.id is not null then
    -- Mark as processing
    update public.ai_media_jobs
    set status = 'processing',
        started_at = now()
    where id = job_row.id;
    
    return query
    select * from public.ai_media_jobs where id = job_row.id;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

comment on function public.get_next_pending_media_job is 'Atomically get and lock the next pending media job for processing';

-- ========================================
-- 7. Grant necessary permissions
-- ========================================

-- Allow authenticated users to check their own rate limit
grant execute on function public.check_ai_job_rate_limit to authenticated;

-- Service role will call job processing functions
grant execute on function public.get_next_pending_media_job to service_role;