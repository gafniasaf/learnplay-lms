-- Fix security: Set explicit search_path on trigger function
create or replace function public.trigger_ai_job_runner()
returns trigger as $$
declare
  supabase_url text;
  service_role_key text;
  request_id bigint;
begin
  supabase_url := current_setting('app.supabase_url', true);
  service_role_key := current_setting('app.service_role_key', true);
  
  if supabase_url is null then
    supabase_url := 'https://grffepyrmjihphldyfha.supabase.co';
  end if;
  
  if new.status = 'pending' and (old.status is null or old.status != 'pending') then
    select net.http_post(
      url := supabase_url || '/functions/v1/ai-job-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(service_role_key, current_setting('app.service_role_key', true))
      ),
      body := '{}'::jsonb
    ) into request_id;
    
    raise notice 'Triggered ai-job-runner for job % (request_id: %)', new.id, request_id;
  end if;
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;