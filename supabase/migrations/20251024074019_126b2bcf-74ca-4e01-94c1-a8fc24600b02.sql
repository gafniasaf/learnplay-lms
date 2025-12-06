-- Update trigger to use 120-second timeout for pg_net
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
    
    -- Call edge function with 120-second timeout (jobs can take 60+ seconds)
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/ai-job-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(service_role_key, current_setting('app.service_role_key', true))
      ),
      body := jsonb_build_object('job_id', new.id),
      timeout_milliseconds := 120000  -- 120 seconds
    ) INTO request_id;
    
    RAISE NOTICE 'Triggered ai-job-runner for job % (request_id: %)', new.id, request_id;
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;