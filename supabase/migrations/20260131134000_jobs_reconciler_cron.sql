-- Schedule jobs-reconciler to auto-heal stalled jobs

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('jobs-reconciler-every-minute');
exception
  when others then
    null;
end;
$$;

select cron.schedule(
  'jobs-reconciler-every-minute',
  '* * * * *', -- every minute
  $$
  select
    net.http_post(
      url := 'https://eidcegehaswbtzrwzvfa.supabase.co/functions/v1/jobs-reconciler',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);
