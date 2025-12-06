-- Enable required extensions for cron scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create scheduled job to process AI course generation jobs every minute
SELECT cron.schedule(
  'process-ai-course-jobs',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url:='https://grffepyrmjihphldyfha.supabase.co/functions/v1/ai-job-runner',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.supabase_service_role_key') || '"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);