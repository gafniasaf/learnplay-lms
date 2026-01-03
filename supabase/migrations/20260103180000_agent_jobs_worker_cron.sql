-- Factory Pipeline: Agent Jobs Auto-Processing
-- Schedules ai-job-runner to drain ai_agent_jobs (status='queued') automatically.
--
-- Notes:
-- - Uses pg_cron + pg_net to HTTP POST the Edge function.
-- - ai-job-runner is deployed with verify_jwt=false and is responsible for claiming + running jobs safely.
-- - This mirrors the "course generation pipeline" behavior where queued work proceeds without manual UI intervention.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  -- best-effort: if not scheduled yet, ignore
  perform cron.unschedule('process-ai-agent-jobs');
exception
  when others then
    null;
end;
$$;

select cron.schedule(
  'process-ai-agent-jobs',
  '* * * * *', -- every minute
  $$
  select
    net.http_post(
      url := 'https://eidcegehaswbtzrwzvfa.supabase.co/functions/v1/ai-job-runner?worker=1&queue=agent',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);


