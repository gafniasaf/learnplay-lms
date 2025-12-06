-- Remove hard-coded URL fallback and add test mode support
CREATE OR REPLACE FUNCTION public.trigger_ai_job_runner()
RETURNS trigger AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  request_id bigint;
  test_mode text;
BEGIN
  -- Check if we're in test mode
  test_mode := current_setting('app.test_mode', true);
  IF test_mode = 'true' OR test_mode = '1' THEN
    RAISE NOTICE 'Test mode enabled - skipping trigger for job %', new.id;
    RETURN new;
  END IF;

  supabase_url := current_setting('app.supabase_url', true);
  service_role_key := current_setting('app.service_role_key', true);
  
  -- Fail fast if URL not configured (don't use fallback)
  IF supabase_url IS NULL OR supabase_url = '' THEN
    RAISE WARNING 'app.supabase_url not configured - cannot trigger ai-job-runner for job %', new.id;
    RETURN new;
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
        'Authorization', 'Bearer ' || coalesce(service_role_key, '')
      ),
      body := jsonb_build_object('job_id', new.id)
    ) INTO request_id;
    
    RAISE NOTICE 'Triggered ai-job-runner for job % (request_id: %)', new.id, request_id;
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
