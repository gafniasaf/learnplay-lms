-- Update trigger to also fire when explicitly updating pending jobs
DROP TRIGGER IF EXISTS ai_course_jobs_instant_processing ON public.ai_course_jobs;

CREATE OR REPLACE FUNCTION public.trigger_ai_job_runner()
RETURNS trigger AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  request_id bigint;
BEGIN
  supabase_url := current_setting('app.supabase_url', true);
  service_role_key := current_setting('app.service_role_key', true);
  
  IF supabase_url IS NULL THEN
    supabase_url := 'https://grffepyrmjihphldyfha.supabase.co';
  END IF;
  
  -- Trigger when:
  -- 1. New job inserted as pending
  -- 2. Job status changes to pending
  -- 3. Pending job heartbeat is updated (for manual reprocessing)
  IF (TG_OP = 'INSERT' AND new.status = 'pending') OR
     (TG_OP = 'UPDATE' AND new.status = 'pending' AND (old.status IS NULL OR old.status != 'pending')) OR
     (TG_OP = 'UPDATE' AND new.status = 'pending' AND old.status = 'pending' AND 
      new.last_heartbeat IS DISTINCT FROM old.last_heartbeat) THEN
    
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/ai-job-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(service_role_key, current_setting('app.service_role_key', true))
      ),
      body := jsonb_build_object('job_id', new.id)
    ) INTO request_id;
    
    RAISE NOTICE 'Triggered ai-job-runner for job % (request_id: %)', new.id, request_id;
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ai_course_jobs_instant_processing
AFTER INSERT OR UPDATE ON public.ai_course_jobs
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ai_job_runner();

-- Now trigger processing for all existing pending jobs
SELECT public.process_pending_jobs();
