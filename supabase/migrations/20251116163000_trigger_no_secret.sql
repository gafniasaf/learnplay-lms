-- Update trigger_ai_job_runner to avoid storing secrets in Postgres.
-- Removes dependency on app.service_role_key GUC and falls back to the known project URL
-- if app.supabase_url is not configured.

create or replace function public.trigger_ai_job_runner()
returns trigger as $$
declare
  supabase_url text;
  request_id bigint;
  test_mode text;
begin
  -- Honour test mode flag to disable automatic triggering when running deterministic tests.
  test_mode := current_setting('app.test_mode', true);
  if test_mode = 'true' or test_mode = '1' then
    raise notice 'Test mode enabled - skipping trigger for job %', new.id;
    return new;
  end if;

  supabase_url := current_setting('app.supabase_url', true);

  if supabase_url is null or supabase_url = '' then
    -- Non-secret fallback keeps the trigger working even when configuration is missing.
    supabase_url := 'https://zhrhuxjagenhhhttphmu.supabase.co';
  end if;

  if supabase_url is null or supabase_url = '' then
    raise warning 'Supabase URL not configured - cannot trigger ai-job-runner for job %', new.id;
    return new;
  end if;

  if (TG_OP = 'INSERT' AND new.status = 'pending') OR
     (TG_OP = 'UPDATE' AND new.status = 'pending' AND (old.status IS NULL OR old.status != 'pending')) OR
     (TG_OP = 'UPDATE' AND new.status = 'pending' AND old.status = 'pending' AND
      new.last_heartbeat IS DISTINCT FROM old.last_heartbeat) THEN

    select net.http_post(
      url := supabase_url || '/functions/v1/ai-job-runner',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    ) into request_id;

    raise notice 'Triggered ai-job-runner for job % (request_id: %)', new.id, request_id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

comment on function public.trigger_ai_job_runner is
  'Automatically triggers ai-job-runner edge function when new job is inserted with pending status';

