-- Add missing job resilience columns to ai_course_jobs
ALTER TABLE public.ai_course_jobs
ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz,
ADD COLUMN IF NOT EXISTS processing_duration_ms bigint,
ADD COLUMN IF NOT EXISTS generation_duration_ms bigint;

-- Update status enum to include dead_letter and stale
ALTER TABLE public.ai_course_jobs
DROP CONSTRAINT IF EXISTS ai_course_jobs_status_check;

ALTER TABLE public.ai_course_jobs
ADD CONSTRAINT ai_course_jobs_status_check
CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead_letter', 'stale'));

-- Update get_next_pending_job to handle retries and heartbeats
CREATE OR REPLACE FUNCTION public.get_next_pending_job()
RETURNS TABLE(id uuid, course_id text, subject text, grade_band text, grade text, items_per_group integer, mode text) AS $$
DECLARE
  job_row public.ai_course_jobs;
BEGIN
  SELECT *
  INTO job_row
  FROM public.ai_course_jobs
  WHERE (public.ai_course_jobs.status = 'pending')
     OR (public.ai_course_jobs.status = 'failed' AND public.ai_course_jobs.retry_count < public.ai_course_jobs.max_retries)
  ORDER BY public.ai_course_jobs.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF job_row.id IS NOT NULL THEN
    IF job_row.status = 'failed' THEN
      UPDATE public.ai_course_jobs
      SET status = 'processing',
          started_at = now(),
          retry_count = retry_count + 1,
          last_heartbeat = now()
      WHERE public.ai_course_jobs.id = job_row.id;
    ELSE
      UPDATE public.ai_course_jobs
      SET status = 'processing',
          started_at = now(),
          last_heartbeat = now()
      WHERE public.ai_course_jobs.id = job_row.id;
    END IF;
    
    RETURN QUERY
    SELECT job_row.id, job_row.course_id, job_row.subject, job_row.grade_band, 
           job_row.grade, job_row.items_per_group, job_row.mode;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add heartbeat update function
CREATE OR REPLACE FUNCTION public.update_job_heartbeat(
  job_id uuid,
  job_table text DEFAULT 'ai_course_jobs'
)
RETURNS void AS $$
BEGIN
  IF job_table = 'ai_course_jobs' THEN
    UPDATE public.ai_course_jobs
    SET last_heartbeat = now()
    WHERE id = job_id;
  ELSIF job_table = 'ai_media_jobs' THEN
    UPDATE public.ai_media_jobs
    SET last_heartbeat = now()
    WHERE id = job_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.update_job_heartbeat TO service_role;

-- Function to manually trigger processing for all pending jobs
CREATE OR REPLACE FUNCTION public.process_pending_jobs()
RETURNS void AS $$
BEGIN
  -- Touch all pending jobs to trigger the instant processing trigger
  UPDATE public.ai_course_jobs
  SET last_heartbeat = now()
  WHERE status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.process_pending_jobs TO service_role;

COMMENT ON FUNCTION public.process_pending_jobs IS 'Manually trigger processing for all pending jobs by updating their heartbeat';
