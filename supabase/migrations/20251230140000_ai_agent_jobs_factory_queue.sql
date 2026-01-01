-- Factory Queue for Generic Manifest Jobs (ai_agent_jobs)
--
-- Purpose:
-- - Enable async execution for non-course jobs (lessonkit_build, material_ingest, etc.)
-- - Provide durable status tracking, retries, and heartbeats
-- - Provide per-job event stream for UI observability (agent_job_events)
--
-- IMPORTANT:
-- - Idempotent: safe to re-run
-- - No secret values

-- ============================================================================
-- 1) Harden ai_agent_jobs schema (status lifecycle + observability)
-- ============================================================================

ALTER TABLE public.ai_agent_jobs
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz;

COMMENT ON COLUMN public.ai_agent_jobs.created_by IS 'User who enqueued the job (nullable for agent-token enqueues)';
COMMENT ON COLUMN public.ai_agent_jobs.error IS 'Failure reason (if any)';
COMMENT ON COLUMN public.ai_agent_jobs.retry_count IS 'Number of times this job has been retried';
COMMENT ON COLUMN public.ai_agent_jobs.max_retries IS 'Maximum retry attempts before dead_letter';
COMMENT ON COLUMN public.ai_agent_jobs.last_heartbeat IS 'Last heartbeat timestamp from worker';

-- Keep updated_at fresh
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pg_function_is_visible(oid)
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS trigger AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS ai_agent_jobs_set_updated_at ON public.ai_agent_jobs;
CREATE TRIGGER ai_agent_jobs_set_updated_at
BEFORE UPDATE ON public.ai_agent_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Status constraint (drop/recreate for idempotence)
ALTER TABLE public.ai_agent_jobs
  DROP CONSTRAINT IF EXISTS ai_agent_jobs_status_check;
ALTER TABLE public.ai_agent_jobs
  ADD CONSTRAINT ai_agent_jobs_status_check
  CHECK (status IN ('queued', 'processing', 'done', 'failed', 'dead_letter', 'stale'));

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_ai_agent_jobs_org ON public.ai_agent_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_jobs_status_created ON public.ai_agent_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_agent_jobs_type_created ON public.ai_agent_jobs(job_type, created_at);

-- ============================================================================
-- 2) RPC: get_next_pending_agent_job (lock + retry semantics)
-- ============================================================================

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
  WHERE (status = 'queued')
     OR (status = 'failed' AND retry_count < max_retries)
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF job_row.id IS NOT NULL THEN
    IF job_row.status = 'failed' THEN
      UPDATE public.ai_agent_jobs
      SET status = 'processing',
          started_at = now(),
          retry_count = retry_count + 1,
          last_heartbeat = now()
      WHERE id = job_row.id;
    ELSE
      UPDATE public.ai_agent_jobs
      SET status = 'processing',
          started_at = now(),
          last_heartbeat = now()
      WHERE id = job_row.id;
    END IF;

    RETURN QUERY SELECT * FROM public.ai_agent_jobs WHERE id = job_row.id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_next_pending_agent_job IS
  'Atomically get and lock next queued/failed ai_agent_job; auto-retries failed jobs if under max_retries';

GRANT EXECUTE ON FUNCTION public.get_next_pending_agent_job TO service_role;

-- ============================================================================
-- 3) Extend heartbeat RPC to include ai_agent_jobs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_job_heartbeat(job_id uuid, job_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF job_table = 'ai_course_jobs' THEN
    UPDATE public.ai_course_jobs SET last_heartbeat = now() WHERE id = job_id;
  ELSIF job_table = 'ai_media_jobs' THEN
    UPDATE public.ai_media_jobs SET last_heartbeat = now() WHERE id = job_id;
  ELSIF job_table = 'ai_agent_jobs' THEN
    UPDATE public.ai_agent_jobs SET last_heartbeat = now() WHERE id = job_id;
  ELSE
    RAISE EXCEPTION 'Invalid job table: %', job_table;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_job_heartbeat TO service_role;

-- ============================================================================
-- 4) Agent job events (separate table to avoid FK conflicts with ai_course_jobs job_events)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.ai_agent_jobs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('info', 'success', 'error')),
  progress INTEGER,
  message TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, seq)
);

ALTER TABLE public.agent_job_events ENABLE ROW LEVEL SECURITY;

-- Default: users can read agent job events for jobs in their org (service role bypasses RLS anyway).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_job_events'
      AND policyname = 'Users can read agent_job_events in org'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can read agent_job_events in org"
        ON public.agent_job_events
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.ai_agent_jobs j
            WHERE j.id = agent_job_events.job_id
              AND j.organization_id = (auth.jwt() ->> 'organization_id')::uuid
          )
        );
    $policy$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_job_events_job_id ON public.agent_job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_agent_job_events_job_seq ON public.agent_job_events(job_id, seq);

-- Sequence helper for agent job events
CREATE OR REPLACE FUNCTION public.next_agent_job_event_seq(p_job_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(seq), 0) + 1
  INTO next_seq
  FROM public.agent_job_events
  WHERE job_id = p_job_id;

  RETURN next_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_agent_job_event_seq TO service_role;



