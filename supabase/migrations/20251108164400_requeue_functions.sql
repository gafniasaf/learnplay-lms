-- Requeue helper functions (course & media jobs)
-- Safe: only resets failed/dead_letter/stale back to pending

create or replace function public.requeue_job(p_job_id uuid, p_job_table text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_job_table = 'ai_course_jobs' then
    update public.ai_course_jobs
    set status = 'pending',
        retry_count = 0,
        error = null,
        started_at = null,
        completed_at = null,
        last_heartbeat = null
    where id = p_job_id
      and status in ('failed','dead_letter','stale');

  elsif p_job_table = 'ai_media_jobs' then
    update public.ai_media_jobs
    set status = 'pending',
        retry_count = 0,
        error = null,
        started_at = null,
        completed_at = null,
        last_heartbeat = null
    where id = p_job_id
      and status in ('failed','dead_letter','stale');

  else
    raise exception 'Invalid job table: %', p_job_table;
  end if;
end;
$$;

comment on function public.requeue_job is 'Admin action to reset a failed/dead/stale job back to pending';

grant execute on function public.requeue_job(uuid, text) to authenticated, service_role;

-- Convenience wrappers
create or replace function public.requeue_course_job(p_job_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.requeue_job(p_job_id, 'ai_course_jobs');
$$;

grant execute on function public.requeue_course_job(uuid) to authenticated, service_role;

create or replace function public.requeue_media_job(p_job_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.requeue_job(p_job_id, 'ai_media_jobs');
$$;

grant execute on function public.requeue_media_job(uuid) to authenticated, service_role;
