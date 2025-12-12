-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres (required for cron jobs)
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule the job processor to run every minute
-- This calls the process-pending-jobs Edge Function
SELECT cron.schedule(
  'process-pending-jobs',  -- unique name
  '* * * * *',             -- every minute
  $$
  SELECT net.http_post(
    url := 'https://eidcegehaswbtzrwzvfa.supabase.co/functions/v1/process-pending-jobs',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NDYzNTAsImV4cCI6MjA4MDQyMjM1MH0.DpXOHjccnVEewnPF5gA6tw27TcRXkkAfgrJkn0NvT_Q", "x-agent-token": "learnplay-agent-token"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Note: pg_cron jobs run in the postgres role
-- The job will trigger the Edge Function which processes pending jobs

