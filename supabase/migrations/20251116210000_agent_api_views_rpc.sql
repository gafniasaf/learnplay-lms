-- Agent API: read-only views and enqueue RPC
-- This migration creates:
--  - v_ai_course_jobs: safe listing view for jobs
--  - v_job_events: safe listing view for job events
--  - enqueue_ai_job(subject, format, course_id, extra): SECURITY DEFINER RPC to create a job

-- View: v_ai_course_jobs (safe columns only)
create or replace view public.v_ai_course_jobs as
select
  j.id,
  j.course_id,
  j.subject,
  coalesce(j.grade_band, j.grade) as grade_band,
  j.grade,
  j.status,
  j.items_per_group,
  j.mode,
  j.created_by,
  j.created_at,
  j.started_at,
  j.completed_at,
  j.last_event_at,
  -- optional telemetry/progress (nullable on older rows)
  j.progress_stage,
  j.progress_percent,
  j.progress_message
from public.ai_course_jobs j;

-- View: v_job_events (safe columns only)
create or replace view public.v_job_events as
select
  e.id,
  e.job_id,
  e.seq,
  e.step,
  e.status,
  e.progress,
  e.message,
  e.meta,
  e.created_at
from public.job_events e;

-- RPC: enqueue_ai_job
-- Inserts a pending ai_course_job and returns the job id.
-- SECURITY DEFINER so it can run from Edge Functions regardless of caller RLS.
create or replace function public.enqueue_ai_job(
  p_subject text,
  p_format text default 'practice',
  p_course_id text default null,
  p_extra jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_course_id text;
  v_items_per_group integer;
  v_mode text;
  v_grade_band text;
  v_grade text;
  v_job_id uuid;
begin
  -- Derive course id if not provided: kebab-case subject + timestamp
  if p_course_id is null or length(trim(p_course_id)) = 0 then
    v_course_id := regexp_replace(lower(coalesce(p_subject,'untitled')), '\s+', '-', 'g') || '-' || extract(epoch from now())::bigint;
  else
    v_course_id := p_course_id;
  end if;

  -- Sensible defaults; agents can override later via updates if needed
  v_items_per_group := coalesce((p_extra->>'items_per_group')::int, 12);
  v_mode := coalesce(nullif(p_extra->>'mode',''), 'options');
  v_grade_band := coalesce(nullif(p_extra->>'grade_band',''), 'All Grades');
  v_grade := nullif(p_extra->>'grade','');

  insert into public.ai_course_jobs(
    course_id, subject, grade_band, grade, items_per_group, mode, status, created_by
  ) values (
    v_course_id, p_subject, v_grade_band, v_grade, v_items_per_group, v_mode, 'pending', null
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

-- Grants
grant select on public.v_ai_course_jobs to authenticated, anon;
grant select on public.v_job_events to authenticated, anon;
grant execute on function public.enqueue_ai_job(text, text, text, jsonb) to authenticated;

-- Helpful indexes for the views’ underlying tables (no-op if they exist)
create index if not exists v_jobs_created_idx on public.ai_course_jobs(created_at desc);
create index if not exists v_jobs_status_idx on public.ai_course_jobs(status, created_at);
create index if not exists v_events_job_idx on public.job_events(job_id, seq);


