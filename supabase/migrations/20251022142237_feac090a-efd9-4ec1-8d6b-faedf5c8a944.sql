-- Fix the cron job to use the correct service role key from secrets
-- Drop the existing job
SELECT cron.unschedule('process-ai-course-jobs');

-- Recreate with proper authentication using the anon key for now
-- The edge function itself will use service role key from environment
SELECT cron.schedule(
  'process-ai-course-jobs',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url:='https://grffepyrmjihphldyfha.supabase.co/functions/v1/ai-job-runner',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZmZlcHlybWppaHBobGR5ZmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2NzY4MTYsImV4cCI6MjA3NjI1MjgxNn0.QgMiVaSZERZO7-5-Dul53W8LRtQIv465J29UyySUiek"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);