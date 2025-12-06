-- Generic enqueue RPC bridging multiple job types
-- - For job_type = 'image' → inserts into ai_media_jobs
-- - Otherwise → delegates to existing enqueue_ai_job(subject, format, course_id, extra)
-- Security: SECURITY DEFINER; execution granted to authenticated
-- Idempotency/rate limits are enforced by underlying tables/triggers

create or replace function public.enqueue_ai_job_generic(
  p_job_type text,
  p_course_id text,
  p_item_ref jsonb,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
  v_user uuid;
  v_item_id int;
  v_prompt text;
  v_provider text;
begin
  v_user := auth.uid();

  if p_job_type = 'image' then
    -- Extract common fields
    v_item_id := nullif(p_item_ref->>'itemId','')::int;
    v_prompt := coalesce(p_payload->>'prompt', '');
    v_provider := coalesce(p_payload->>'provider', 'openai');

    insert into public.ai_media_jobs(
      course_id, item_id, media_type, prompt, provider, target_ref, status, created_by
    ) values (
      p_course_id, v_item_id, 'image', v_prompt, v_provider, p_item_ref, 'pending', v_user
    )
    returning id into v_job_id;
  else
    -- Delegate to existing course job RPC (expects subject, format, course_id, extra)
    v_job_id := public.enqueue_ai_job(
      coalesce(p_payload->>'subject',''),
      coalesce(p_payload->>'format',''),
      p_course_id,
      p_payload
    );
  end if;

  return v_job_id;
end
$$;

grant execute on function public.enqueue_ai_job_generic(text, text, jsonb, jsonb) to authenticated;

-- Helpful index for media job queries (no-op if exists)
create index if not exists ai_media_jobs_status_created_idx
  on public.ai_media_jobs(status, created_at);


