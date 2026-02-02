-- Harden ai_agent_jobs lifecycle (backoff, stale, dead-letter)
-- Adds retry backoff field and extends stale/dead-letter helpers to agent jobs.

-- 1) Backoff field for retries
ALTER TABLE public.ai_agent_jobs
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ai_agent_jobs_status_next_attempt
  ON public.ai_agent_jobs(status, next_attempt_at, created_at);

-- 2) Update claim function to respect next_attempt_at
CREATE OR REPLACE FUNCTION public.get_next_pending_agent_job()
RETURNS SETOF public.ai_agent_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_row public.ai_agent_jobs;
BEGIN
  SELECT *
  INTO job_row
  FROM public.ai_agent_jobs
  WHERE (
      status = 'queued'
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    )
    OR (
      status = 'failed'
      AND retry_count < max_retries
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    )
  ORDER BY COALESCE(next_attempt_at, created_at) ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF job_row.id IS NOT NULL THEN
    IF job_row.status = 'failed' THEN
      UPDATE public.ai_agent_jobs
      SET status = 'processing',
          started_at = now(),
          retry_count = retry_count + 1,
          last_heartbeat = now(),
          next_attempt_at = NULL
      WHERE id = job_row.id;
    ELSE
      UPDATE public.ai_agent_jobs
      SET status = 'processing',
          started_at = now(),
          last_heartbeat = now(),
          next_attempt_at = NULL
      WHERE id = job_row.id;
    END IF;

    RETURN QUERY SELECT * FROM public.ai_agent_jobs WHERE id = job_row.id;
  END IF;
END;
$$;

-- 3) Extend stale + dead-letter helpers to ai_agent_jobs
CREATE OR REPLACE FUNCTION public.mark_stale_jobs()
RETURNS TABLE(job_id uuid, job_type text, stale_duration interval) AS $$
DECLARE
  stale_threshold interval := interval '5 minutes';
  agent_stale_threshold interval := interval '15 minutes';
BEGIN
  RETURN QUERY
    UPDATE public.ai_course_jobs
    SET status = 'stale',
        error = 'Job marked stale due to heartbeat timeout'
    WHERE status = 'processing'
      AND last_heartbeat < now() - stale_threshold
    RETURNING id, 'course'::text, now() - last_heartbeat;

  RETURN QUERY
    UPDATE public.ai_media_jobs
    SET status = 'stale',
        error = 'Job marked stale due to heartbeat timeout'
    WHERE status = 'processing'
      AND last_heartbeat < now() - stale_threshold
    RETURNING id, 'media'::text, now() - last_heartbeat;

  RETURN QUERY
    UPDATE public.book_render_jobs
    SET status = 'stale',
        error = 'Job marked stale due to heartbeat timeout'
    WHERE status = 'processing'
      AND last_heartbeat < now() - stale_threshold
    RETURNING id, 'book'::text, now() - last_heartbeat;

  -- Agent jobs: treat stale as failed to enable automatic retries
  RETURN QUERY
    UPDATE public.ai_agent_jobs
    SET status = 'failed',
        error = 'Job marked failed due to heartbeat timeout',
        completed_at = now(),
        next_attempt_at = now()
    WHERE status = 'processing'
      AND COALESCE(last_heartbeat, started_at, created_at) < now() - agent_stale_threshold
    RETURNING id, 'agent'::text, now() - COALESCE(last_heartbeat, started_at, created_at);
END;
$$ language plpgsql security definer;

GRANT EXECUTE ON FUNCTION public.mark_stale_jobs() TO service_role;

CREATE OR REPLACE FUNCTION public.move_to_dead_letter()
RETURNS TABLE(job_id uuid, job_type text, final_error text) AS $$
BEGIN
  RETURN QUERY
    UPDATE public.ai_course_jobs
    SET status = 'dead_letter',
        error = coalesce(error, 'Max retries exceeded') || format(' (retries: %s/%s)', retry_count, max_retries),
        completed_at = now()
    WHERE status = 'failed'
      AND retry_count >= max_retries
    RETURNING id, 'course'::text, error;

  RETURN QUERY
    UPDATE public.ai_media_jobs
    SET status = 'dead_letter',
        error = coalesce(error, 'Max retries exceeded') || format(' (retries: %s/%s)', retry_count, max_retries),
        completed_at = now()
    WHERE status = 'failed'
      AND retry_count >= max_retries
    RETURNING id, 'media'::text, error;

  RETURN QUERY
    UPDATE public.book_render_jobs
    SET status = 'dead_letter',
        error = coalesce(error, 'Max retries exceeded') || format(' (retries: %s/%s)', retry_count, max_retries),
        completed_at = now()
    WHERE status = 'failed'
      AND retry_count >= max_retries
    RETURNING id, 'book'::text, error;

  RETURN QUERY
    UPDATE public.ai_agent_jobs
    SET status = 'dead_letter',
        error = coalesce(error, 'Max retries exceeded') || format(' (retries: %s/%s)', retry_count, max_retries),
        completed_at = now()
    WHERE status = 'failed'
      AND retry_count >= max_retries
    RETURNING id, 'agent'::text, error;
END;
$$ language plpgsql security definer;

GRANT EXECUTE ON FUNCTION public.move_to_dead_letter() TO service_role;
