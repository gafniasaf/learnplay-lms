-- Instant Job Processing via Database Webhooks
-- Triggers ai-job-runner immediately on job insert instead of waiting for cron

-- ========================================
-- 1. Enable pg_net extension for HTTP calls
-- ========================================

create extension if not exists pg_net;

comment on extension pg_net is 'Async HTTP client for PostgreSQL - used to trigger edge functions from database';

-- ========================================
-- 2. Function to trigger ai-job-runner edge function
-- ========================================

create or replace function public.trigger_ai_job_runner()
returns trigger as $$
declare
  supabase_url text;
  service_role_key text;
  request_id bigint;
begin
  -- Get Supabase URL and service role key from environment
  supabase_url := current_setting('app.supabase_url', true);
  service_role_key := current_setting('app.service_role_key', true);
  
  -- Fallback to hardcoded if settings not available
  -- Note: In production, set these via ALTER DATABASE SET
  if supabase_url is null then
    supabase_url := 'https://zhrhuxjagenhhhttphmu.supabase.co';
  end if;
  
  -- Only trigger for pending status (not for updates)
  if new.status = 'pending' and (old.status is null or old.status != 'pending') then
    -- Make async HTTP POST to ai-job-runner edge function
    -- Using pg_net for non-blocking call
    select net.http_post(
      url := supabase_url || '/functions/v1/ai-job-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(service_role_key, current_setting('app.service_role_key', true))
      ),
      body := '{}'::jsonb
    ) into request_id;
    
    -- Log trigger for debugging
    raise notice 'Triggered ai-job-runner for job % (request_id: %)', new.id, request_id;
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

comment on function public.trigger_ai_job_runner is 
  'Automatically triggers ai-job-runner edge function when new job is inserted';

-- ========================================
-- 3. Create trigger on ai_course_jobs
-- ========================================

drop trigger if exists ai_course_jobs_instant_processing on public.ai_course_jobs;

create trigger ai_course_jobs_instant_processing
after insert or update on public.ai_course_jobs
for each row
execute function public.trigger_ai_job_runner();

comment on trigger ai_course_jobs_instant_processing on public.ai_course_jobs is
  'Instantly triggers processing when job is inserted with pending status';

-- ========================================
-- 4. Function to trigger ai-media-runner edge function
-- ========================================

create or replace function public.trigger_ai_media_runner()
returns trigger as $$
declare
  supabase_url text;
  service_role_key text;
  request_id bigint;
begin
  supabase_url := current_setting('app.supabase_url', true);
  service_role_key := current_setting('app.service_role_key', true);
  
  if supabase_url is null then
    supabase_url := 'https://zhrhuxjagenhhhttphmu.supabase.co';
  end if;
  
  if new.status = 'pending' and (old.status is null or old.status != 'pending') then
    select net.http_post(
      url := supabase_url || '/functions/v1/ai-media-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(service_role_key, current_setting('app.service_role_key', true))
      ),
      body := '{}'::jsonb
    ) into request_id;
    
    raise notice 'Triggered ai-media-runner for job % (request_id: %)', new.id, request_id;
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

-- ========================================
-- 5. Create trigger on ai_media_jobs
-- ========================================

drop trigger if exists ai_media_jobs_instant_processing on public.ai_media_jobs;

create trigger ai_media_jobs_instant_processing
after insert or update on public.ai_media_jobs
for each row
execute function public.trigger_ai_media_runner();

-- ========================================
-- 6. Set database configuration for Supabase URL
-- ========================================

-- Note: Run this manually in SQL editor or via ALTER DATABASE:
-- ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
-- ALTER DATABASE postgres SET app.service_role_key = 'your-service-role-key';

-- For now, the functions will use the hardcoded fallback URL
-- This should be updated via Supabase Dashboard → SQL Editor

comment on function public.trigger_ai_media_runner is 
  'Automatically triggers ai-media-runner edge function when new media job is inserted';

