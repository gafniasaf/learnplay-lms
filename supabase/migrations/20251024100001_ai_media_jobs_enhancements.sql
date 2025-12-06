-- Enhance ai_media_jobs with idempotency, target references, priority, and versioning

-- Add columns if they don't exist
do $$ 
begin
  -- idempotency_key: prevents duplicate jobs
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'idempotency_key'
  ) then
    alter table public.ai_media_jobs add column idempotency_key text;
  end if;

  -- target_ref: JSON reference to where this media belongs
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'target_ref'
  ) then
    alter table public.ai_media_jobs add column target_ref jsonb;
  end if;

  -- provider: which AI provider to use
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'provider'
  ) then
    alter table public.ai_media_jobs add column provider text default 'openai-dalle3';
  end if;

  -- style: generation style/variant
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'style'
  ) then
    alter table public.ai_media_jobs add column style text;
  end if;

  -- priority: for job ordering
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'priority'
  ) then
    alter table public.ai_media_jobs add column priority integer default 100;
  end if;

  -- attempts: retry counter
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'attempts'
  ) then
    alter table public.ai_media_jobs add column attempts integer default 0;
  end if;

  -- last_heartbeat: for stale job detection
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'last_heartbeat'
  ) then
    alter table public.ai_media_jobs add column last_heartbeat timestamptz;
  end if;

  -- dead_letter_reason: why job was moved to dead letter queue
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'dead_letter_reason'
  ) then
    alter table public.ai_media_jobs add column dead_letter_reason text;
  end if;

  -- asset_version: for versioned regeneration
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'asset_version'
  ) then
    alter table public.ai_media_jobs add column asset_version integer default 1;
  end if;

  -- cost_usd: track generation cost
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'cost_usd'
  ) then
    alter table public.ai_media_jobs add column cost_usd numeric(10, 4);
  end if;
end $$;

-- Unique constraint for idempotency (prevent duplicate pending jobs)
create unique index if not exists ai_media_jobs_idempotency_unique 
  on public.ai_media_jobs(idempotency_key) 
  where status in ('pending', 'processing');

-- Index for target_ref lookups
create index if not exists ai_media_jobs_target_ref_idx 
  on public.ai_media_jobs using gin(target_ref);

-- Index for priority-based job selection
create index if not exists ai_media_jobs_priority_idx 
  on public.ai_media_jobs(priority desc, created_at asc) 
  where status = 'pending';

-- Index for heartbeat stale detection
create index if not exists ai_media_jobs_heartbeat_idx 
  on public.ai_media_jobs(last_heartbeat) 
  where status = 'processing';

-- Function to generate idempotency key
create or replace function public.generate_media_idempotency_key(
  p_media_type text,
  p_prompt text,
  p_target_ref jsonb,
  p_provider text
)
returns text
language plpgsql
as $$
declare
  v_hash text;
begin
  -- Hash of key components to ensure idempotency
  v_hash := encode(
    digest(
      p_media_type || '||' || 
      p_prompt || '||' || 
      p_target_ref::text || '||' || 
      p_provider,
      'sha256'
    ),
    'hex'
  );
  return v_hash;
end;
$$;

-- Function to mark stale jobs as failed
create or replace function public.mark_stale_media_jobs()
returns integer
language plpgsql
as $$
declare
  v_stale_count integer;
begin
  -- Mark jobs as failed if no heartbeat for 5 minutes
  update public.ai_media_jobs
  set status = 'failed',
      error = 'Job stalled - no heartbeat for 5 minutes',
      dead_letter_reason = 'stale_heartbeat'
  where status = 'processing'
    and last_heartbeat < now() - interval '5 minutes';
  
  get diagnostics v_stale_count = row_count;
  return v_stale_count;
end;
$$;

-- Function to move failed jobs to dead letter after max attempts
create or replace function public.move_media_jobs_to_dead_letter()
returns integer
language plpgsql
as $$
declare
  v_moved_count integer;
begin
  -- Move to dead letter if attempts > 3
  update public.ai_media_jobs
  set dead_letter_reason = 'max_attempts_exceeded'
  where status = 'failed'
    and attempts >= 3
    and dead_letter_reason is null;
  
  get diagnostics v_moved_count = row_count;
  return v_moved_count;
end;
$$;

comment on column public.ai_media_jobs.idempotency_key is 'Unique key to prevent duplicate job submissions';
comment on column public.ai_media_jobs.target_ref is 'JSON reference: {type: "study_text"|"item_stimulus"|"item_option", courseId, itemId?, sectionId?, optionIndex?}';
comment on column public.ai_media_jobs.provider is 'Provider ID from media_generation_providers table';
comment on column public.ai_media_jobs.style is 'Generation style: diagram, photo, illustration, 3d, etc.';
comment on column public.ai_media_jobs.priority is 'Job priority (higher = processed first)';
comment on column public.ai_media_jobs.attempts is 'Number of generation attempts';
comment on column public.ai_media_jobs.last_heartbeat is 'Last heartbeat timestamp for stale detection';
comment on column public.ai_media_jobs.dead_letter_reason is 'Reason for dead letter queue placement';
comment on column public.ai_media_jobs.asset_version is 'Version number for regenerated assets';
comment on column public.ai_media_jobs.cost_usd is 'Actual generation cost in USD';

