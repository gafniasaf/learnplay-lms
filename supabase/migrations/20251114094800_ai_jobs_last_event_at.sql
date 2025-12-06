-- Add last_event_at for efficient job status queries
ALTER TABLE public.ai_course_jobs 
ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMP WITH TIME ZONE;

-- Create index for sorting by last activity
CREATE INDEX IF NOT EXISTS idx_ai_jobs_last_event ON public.ai_course_jobs(last_event_at DESC NULLS LAST);

-- Trigger to update last_event_at when events are inserted
CREATE OR REPLACE FUNCTION public.update_job_last_event()
RETURNS trigger AS $$
BEGIN
  UPDATE public.ai_course_jobs
  SET last_event_at = NEW.created_at
  WHERE id = NEW.job_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS job_events_update_last_event ON public.job_events;
CREATE TRIGGER job_events_update_last_event
AFTER INSERT ON public.job_events
FOR EACH ROW
EXECUTE FUNCTION public.update_job_last_event();
