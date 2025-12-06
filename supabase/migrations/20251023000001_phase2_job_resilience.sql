-- Phase 2: Job Queue Resilience
-- Adds: retry attempts, heartbeats, dead-letter status, metrics tracking

-- ========================================
-- 1. Add retry and heartbeat columns to ai_course_jobs
-- ========================================

alter table public.ai_course_jobs
  add column if not exists retry_count integer not null default 0,
  add column if not exists max_retries integer not null default 3,
  add column if not exists last_heartbeat timestamptz,
  add column if not exists processing_duration_ms bigint,
  add column if not exists generation_duration_ms bigint;

comment on column public.ai_course_jobs.retry_count is 'Number of times this job has been retried';
comment on column public.ai_course_jobs.max_retries is 'Maximum retry attempts before moving to dead_letter';
comment on column public.ai_course_jobs.last_heartbeat is 'Last heartbeat timestamp from worker';
comment on column public.ai_course_jobs.processing_duration_ms is 'Total processing time in milliseconds';
comment on column public.ai_course_jobs.generation_duration_ms is 'AI generation time only (subset of processing)';

-- Update status enum to include dead_letter
alter table public.ai_course_jobs
  drop constraint if exists ai_course_jobs_status_check;

alter table public.ai_course_jobs
  add constraint ai_course_jobs_status_check
  check (status in ('pending', 'processing', 'done', 'failed', 'dead_letter', 'stale'));

comment on constraint ai_course_jobs_status_check on public.ai_course_jobs is 
  'dead_letter = max retries exceeded; stale = heartbeat timeout';

-- ========================================
-- 2. Add retry and heartbeat columns to ai_media_jobs
-- ========================================

alter table public.ai_media_jobs
  add column if not exists retry_count integer not null default 0,
  add column if not exists max_retries integer not null default 3,
  add column if not exists last_heartbeat timestamptz,
  add column if not exists processing_duration_ms bigint;

-- Update status enum to include dead_letter
alter table public.ai_media_jobs
  drop constraint if exists ai_media_jobs_status_check;

alter table public.ai_media_jobs
  add constraint ai_media_jobs_status_check
  check (status in ('pending', 'processing', 'done', 'failed', 'dead_letter', 'stale'));

-- ========================================
-- 3. Enhanced get_next_pending_job with retry logic
-- ========================================

-- Drop existing function to allow return type change
drop function if exists public.get_next_pending_job();

create or replace function public.get_next_pending_job()
returns setof public.ai_course_jobs as $$
declare
  job_row public.ai_course_jobs;
begin
  -- Select oldest pending OR failed job (if retry_count < max_retries)
  select *
  into job_row
  from public.ai_course_jobs
  where (status = 'pending')
     or (status = 'failed' and retry_count < max_retries)
  order by created_at asc
  limit 1
  for update skip locked;
  
  if job_row.id is not null then
    -- Increment retry count if this is a failed job being retried
    if job_row.status = 'failed' then
      update public.ai_course_jobs
      set status = 'processing',
          started_at = now(),
          retry_count = retry_count + 1,
          last_heartbeat = now()
      where id = job_row.id;
    else
      -- First attempt
      update public.ai_course_jobs
      set status = 'processing',
          started_at = now(),
          last_heartbeat = now()
      where id = job_row.id;
    end if;
    
    return query
    select * from public.ai_course_jobs where id = job_row.id;
  end if;
end;
$$ language plpgsql security definer;

comment on function public.get_next_pending_job is 
  'Atomically get and lock next pending/failed job; auto-retries failed jobs if under max_retries';

-- ========================================
-- 4. Enhanced get_next_pending_media_job with retry logic
-- ========================================

create or replace function public.get_next_pending_media_job()
returns setof public.ai_media_jobs as $$
declare
  job_row public.ai_media_jobs;
begin
  select *
  into job_row
  from public.ai_media_jobs
  where (status = 'pending')
     or (status = 'failed' and retry_count < max_retries)
  order by created_at asc
  limit 1
  for update skip locked;
  
  if job_row.id is not null then
    if job_row.status = 'failed' then
      update public.ai_media_jobs
      set status = 'processing',
          started_at = now(),
          retry_count = retry_count + 1,
          last_heartbeat = now()
      where id = job_row.id;
    else
      update public.ai_media_jobs
      set status = 'processing',
          started_at = now(),
          last_heartbeat = now()
      where id = job_row.id;
    end if;
    
    return query
    select * from public.ai_media_jobs where id = job_row.id;
  end if;
end;
$$ language plpgsql security definer;

-- ========================================
-- 5. Heartbeat update function
-- ========================================

create or replace function public.update_job_heartbeat(job_id uuid, job_table text)
returns void as $$
begin
  if job_table = 'ai_course_jobs' then
    update public.ai_course_jobs
    set last_heartbeat = now()
    where id = job_id;
  elsif job_table = 'ai_media_jobs' then
    update public.ai_media_jobs
    set last_heartbeat = now()
    where id = job_id;
  else
    raise exception 'Invalid job table: %', job_table;
  end if;
end;
$$ language plpgsql security definer;

comment on function public.update_job_heartbeat is 
  'Update heartbeat timestamp for a processing job to indicate worker is alive';

grant execute on function public.update_job_heartbeat to service_role;

-- ========================================
-- 6. Detect and mark stale jobs (heartbeat timeout)
-- ========================================

create or replace function public.mark_stale_jobs()
returns table(job_id uuid, job_type text, stale_duration interval) as $$
declare
  stale_threshold interval := interval '5 minutes';
begin
  -- Mark stale course jobs
  update public.ai_course_jobs
  set status = 'stale',
      error = 'Job marked stale due to heartbeat timeout'
  where status = 'processing'
    and last_heartbeat < now() - stale_threshold
  returning id, 'course'::text, now() - last_heartbeat
  into job_id, job_type, stale_duration;
  
  if found then
    return next;
  end if;
  
  -- Mark stale media jobs
  update public.ai_media_jobs
  set status = 'stale',
      error = 'Job marked stale due to heartbeat timeout'
  where status = 'processing'
    and last_heartbeat < now() - stale_threshold
  returning id, 'media'::text, now() - last_heartbeat
  into job_id, job_type, stale_duration;
  
  if found then
    return next;
  end if;
end;
$$ language plpgsql security definer;

comment on function public.mark_stale_jobs is 
  'Mark jobs as stale if heartbeat has not been updated in 5 minutes';

grant execute on function public.mark_stale_jobs to service_role;

-- ========================================
-- 7. Move failed jobs to dead_letter after max retries
-- ========================================

create or replace function public.move_to_dead_letter()
returns table(job_id uuid, job_type text, final_error text) as $$
begin
  -- Move course jobs to dead_letter
  update public.ai_course_jobs
  set status = 'dead_letter',
      error = coalesce(error, 'Max retries exceeded') || format(' (retries: %s/%s)', retry_count, max_retries),
      completed_at = now()
  where status = 'failed'
    and retry_count >= max_retries
  returning id, 'course'::text, error
  into job_id, job_type, final_error;
  
  if found then
    return next;
  end if;
  
  -- Move media jobs to dead_letter
  update public.ai_media_jobs
  set status = 'dead_letter',
      error = coalesce(error, 'Max retries exceeded') || format(' (retries: %s/%s)', retry_count, max_retries),
      completed_at = now()
  where status = 'failed'
    and retry_count >= max_retries
  returning id, 'media'::text, error
  into job_id, job_type, final_error;
  
  if found then
    return next;
  end if;
end;
$$ language plpgsql security definer;

comment on function public.move_to_dead_letter is 
  'Move jobs that have exhausted retries to dead_letter status';

grant execute on function public.move_to_dead_letter to service_role;

-- ========================================
-- 8. Requeue dead_letter or stale jobs (admin action)
-- ========================================

create or replace function public.requeue_job(job_id uuid, job_table text)
returns void as $$
begin
  if job_table = 'ai_course_jobs' then
    update public.ai_course_jobs
    set status = 'pending',
        retry_count = 0,
        error = null,
        started_at = null,
        completed_at = null,
        last_heartbeat = null
    where id = job_id
      and status in ('failed', 'dead_letter', 'stale');
  elsif job_table = 'ai_media_jobs' then
    update public.ai_media_jobs
    set status = 'pending',
        retry_count = 0,
        error = null,
        started_at = null,
        completed_at = null,
        last_heartbeat = null
    where id = job_id
      and status in ('failed', 'dead_letter', 'stale');
  else
    raise exception 'Invalid job table: %', job_table;
  end if;
end;
$$ language plpgsql security definer;

comment on function public.requeue_job is 
  'Admin action to reset a failed/dead/stale job back to pending';

-- Grant to authenticated users with admin role (will add role check later)
grant execute on function public.requeue_job to authenticated;

-- ========================================
-- 9. Job metrics view
-- ========================================

create or replace view public.ai_job_metrics as
select
  'course'::text as job_type,
  status,
  count(*) as count,
  avg(processing_duration_ms) as avg_processing_ms,
  max(processing_duration_ms) as max_processing_ms,
  avg(retry_count) as avg_retries,
  max(retry_count) as max_retries
from public.ai_course_jobs
group by status

union all

select
  'media'::text as job_type,
  status,
  count(*) as count,
  avg(processing_duration_ms) as avg_processing_ms,
  max(processing_duration_ms) as max_processing_ms,
  avg(retry_count) as avg_retries,
  max(retry_count) as max_retries
from public.ai_media_jobs
group by status;

comment on view public.ai_job_metrics is 
  'Aggregated metrics for job queue monitoring and observability';

-- ========================================
-- 10. Create indexes for heartbeat and metrics queries
-- ========================================

create index if not exists ai_course_jobs_heartbeat_idx
  on public.ai_course_jobs(last_heartbeat)
  where status = 'processing';

create index if not exists ai_media_jobs_heartbeat_idx
  on public.ai_media_jobs(last_heartbeat)
  where status = 'processing';

create index if not exists ai_course_jobs_retry_idx
  on public.ai_course_jobs(status, retry_count);

create index if not exists ai_media_jobs_retry_idx
  on public.ai_media_jobs(status, retry_count);

