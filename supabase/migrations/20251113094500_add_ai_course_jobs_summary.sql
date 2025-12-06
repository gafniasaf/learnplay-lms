-- Add summary JSONB column to ai_course_jobs for consolidated job metrics
-- Safe to run multiple times
ALTER TABLE public.ai_course_jobs
  ADD COLUMN IF NOT EXISTS summary jsonb;

-- Optionally, comment for documentation
COMMENT ON COLUMN public.ai_course_jobs.summary IS 'Consolidated job summary: provider/model/tokens/latency/attempts/review/imagesPending/completion timestamp';
