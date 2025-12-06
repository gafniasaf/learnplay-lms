-- Create job_events table for tracking job progress
CREATE TABLE IF NOT EXISTS public.job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.ai_course_jobs(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('info', 'success', 'error')),
  progress INTEGER,
  message TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(job_id, seq)
);

-- Enable RLS
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

-- Users can view events for jobs they can see
CREATE POLICY "users view events for visible jobs"
ON public.job_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.ai_course_jobs
    WHERE ai_course_jobs.id = job_events.job_id
    AND (
      ai_course_jobs.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    )
  )
);

-- Service role can insert events (for edge functions)
CREATE POLICY "service role insert events"
ON public.job_events
FOR INSERT
WITH CHECK (true);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON public.job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_job_seq ON public.job_events(job_id, seq);
CREATE INDEX IF NOT EXISTS idx_job_events_created_at ON public.job_events(created_at);

-- Function to get next sequence number
CREATE OR REPLACE FUNCTION public.next_job_event_seq(p_job_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(seq), 0) + 1
  INTO next_seq
  FROM public.job_events
  WHERE job_id = p_job_id;
  
  RETURN next_seq;
END;
$$;
