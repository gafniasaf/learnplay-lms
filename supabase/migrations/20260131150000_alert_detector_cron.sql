-- Schedule alert-detector to run every 5 minutes for proactive health monitoring
-- Uses pg_cron + pg_net to HTTP POST the Edge function.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'alert-detector-every-5min') then
    -- Will be created below
    null;
  end if;
end;
$$;

select cron.schedule(
  'alert-detector-every-5min',
  '*/5 * * * *', -- every 5 minutes
  $$
  select net.http_post(
    url := current_setting('app.settings.edge_function_url', true) || '/alert-detector',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Agent-Token', current_setting('app.settings.agent_token', true),
      'X-Organization-Id', current_setting('app.settings.organization_id', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
