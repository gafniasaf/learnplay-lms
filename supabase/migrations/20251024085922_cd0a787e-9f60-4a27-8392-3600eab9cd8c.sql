-- Migration 1: Media Generation Providers Table
create table if not exists public.media_generation_providers (
  id text primary key,
  name text not null,
  media_types text[] not null,
  enabled boolean default true,
  cost_per_unit numeric(10, 4),
  avg_generation_time_seconds integer,
  quality_rating integer check (quality_rating >= 1 and quality_rating <= 5),
  config jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.media_generation_providers enable row level security;

create policy "Anyone can view enabled providers"
  on public.media_generation_providers for select
  using (enabled = true);

create policy "Admins can manage providers"
  on public.media_generation_providers for all
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

insert into public.media_generation_providers (id, name, media_types, enabled, cost_per_unit, avg_generation_time_seconds, quality_rating, config) values
  ('openai-dalle3', 'DALL-E 3', array['image'], true, 0.04, 45, 5, 
   '{"model": "dall-e-3", "sizes": ["1024x1024", "1792x1024", "1024x1792"], "quality": "standard"}'::jsonb),
  ('openai-dalle3-hd', 'DALL-E 3 HD', array['image'], true, 0.08, 50, 5, 
   '{"model": "dall-e-3", "sizes": ["1024x1024", "1792x1024", "1024x1792"], "quality": "hd"}'::jsonb),
  ('replicate-sdxl', 'Stable Diffusion XL', array['image'], false, 0.01, 15, 4,
   '{"model": "stability-ai/sdxl:latest", "steps": 30, "guidance_scale": 7.5}'::jsonb),
  ('openai-tts', 'OpenAI TTS', array['audio'], true, 0.015, 20, 5,
   '{"model": "tts-1", "voices": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]}'::jsonb),
  ('openai-tts-hd', 'OpenAI TTS HD', array['audio'], true, 0.030, 25, 5,
   '{"model": "tts-1-hd", "voices": ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]}'::jsonb),
  ('elevenlabs', 'ElevenLabs', array['audio'], false, 0.03, 15, 5,
   '{"voices": [], "model": "eleven_monolingual_v1"}'::jsonb),
  ('replicate-zeroscope', 'Zeroscope Video', array['video'], false, 0.25, 180, 3,
   '{"model": "anotherjesse/zeroscope-v2-xl:latest", "fps": 8, "num_frames": 24}'::jsonb)
on conflict (id) do nothing;

create or replace function public.get_providers_for_media_type(p_media_type text)
returns setof public.media_generation_providers
language sql
stable
as $$
  select *
  from public.media_generation_providers
  where enabled = true
    and p_media_type = any(media_types)
  order by quality_rating desc, cost_per_unit asc;
$$;

create index if not exists idx_providers_media_types on public.media_generation_providers using gin(media_types);
create index if not exists idx_providers_enabled on public.media_generation_providers(enabled) where enabled = true;

comment on table public.media_generation_providers is 'Configuration and metadata for AI media generation providers';
comment on column public.media_generation_providers.config is 'Provider-specific settings (JSON): model, voices, sizes, etc.';

-- Migration 2: AI Media Jobs Enhancements
do $$ 
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'idempotency_key'
  ) then
    alter table public.ai_media_jobs add column idempotency_key text;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'target_ref'
  ) then
    alter table public.ai_media_jobs add column target_ref jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'provider'
  ) then
    alter table public.ai_media_jobs add column provider text default 'openai-dalle3';
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'style'
  ) then
    alter table public.ai_media_jobs add column style text;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'priority'
  ) then
    alter table public.ai_media_jobs add column priority integer default 100;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'attempts'
  ) then
    alter table public.ai_media_jobs add column attempts integer default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'last_heartbeat'
  ) then
    alter table public.ai_media_jobs add column last_heartbeat timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'dead_letter_reason'
  ) then
    alter table public.ai_media_jobs add column dead_letter_reason text;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'asset_version'
  ) then
    alter table public.ai_media_jobs add column asset_version integer default 1;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'ai_media_jobs' and column_name = 'cost_usd'
  ) then
    alter table public.ai_media_jobs add column cost_usd numeric(10, 4);
  end if;
end $$;

create unique index if not exists ai_media_jobs_idempotency_unique 
  on public.ai_media_jobs(idempotency_key) 
  where status in ('pending', 'processing');

create index if not exists ai_media_jobs_target_ref_idx 
  on public.ai_media_jobs using gin(target_ref);

create index if not exists ai_media_jobs_priority_idx 
  on public.ai_media_jobs(priority desc, created_at asc) 
  where status = 'pending';

create index if not exists ai_media_jobs_heartbeat_idx 
  on public.ai_media_jobs(last_heartbeat) 
  where status = 'processing';

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

create or replace function public.mark_stale_media_jobs()
returns integer
language plpgsql
as $$
declare
  v_stale_count integer;
begin
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

create or replace function public.move_media_jobs_to_dead_letter()
returns integer
language plpgsql
as $$
declare
  v_moved_count integer;
begin
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

-- Migration 3: Media Assets
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  logical_id text not null,
  version integer not null default 1,
  storage_path text not null,
  storage_bucket text not null default 'courses',
  public_url text not null,
  media_type text not null check (media_type in ('image', 'audio', 'video')),
  mime_type text,
  file_size_bytes integer,
  duration_seconds numeric(10, 2),
  dimensions jsonb,
  provider text not null,
  model text,
  prompt text not null,
  style text,
  seed text,
  cost_usd numeric(10, 4),
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  status text not null default 'active' check (status in ('active', 'archived', 'quarantined', 'deleted')),
  moderation_status text check (moderation_status in ('approved', 'pending', 'flagged', 'rejected')),
  moderation_flags jsonb,
  usage_count integer default 0,
  last_used_at timestamptz,
  alt_text text,
  caption text,
  metadata jsonb default '{}'::jsonb,
  unique(logical_id, version)
);

alter table public.media_assets enable row level security;

create policy "Anyone can view active assets"
  on public.media_assets for select
  using (status = 'active' and (moderation_status is null or moderation_status = 'approved'));

create policy "Creators can view own assets"
  on public.media_assets for select
  using (created_by = auth.uid());

create policy "Authenticated can insert assets"
  on public.media_assets for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Creators can update own assets"
  on public.media_assets for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Admins can manage all assets"
  on public.media_assets for all
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

create index if not exists media_assets_logical_id_idx on public.media_assets(logical_id);
create index if not exists media_assets_provider_idx on public.media_assets(provider);
create index if not exists media_assets_media_type_idx on public.media_assets(media_type);
create index if not exists media_assets_created_by_idx on public.media_assets(created_by);
create index if not exists media_assets_status_idx on public.media_assets(status) where status = 'active';
create index if not exists media_assets_moderation_idx on public.media_assets(moderation_status) where moderation_status = 'pending';
create index if not exists media_assets_prompt_search_idx on public.media_assets using gin(to_tsvector('english', prompt || ' ' || coalesce(alt_text, '')));

create or replace function public.increment_asset_usage(p_asset_id uuid)
returns void
language plpgsql
as $$
begin
  update public.media_assets
  set usage_count = usage_count + 1,
      last_used_at = now()
  where id = p_asset_id;
end;
$$;

create or replace function public.get_latest_asset_version(p_logical_id text)
returns public.media_assets
language sql
stable
as $$
  select *
  from public.media_assets
  where logical_id = p_logical_id
    and status = 'active'
  order by version desc
  limit 1;
$$;

create or replace function public.search_assets_by_prompt(p_query text, p_limit integer default 10)
returns setof public.media_assets
language sql
stable
as $$
  select *
  from public.media_assets
  where status = 'active'
    and to_tsvector('english', prompt || ' ' || coalesce(alt_text, '')) @@ plainto_tsquery('english', p_query)
  order by ts_rank(to_tsvector('english', prompt || ' ' || coalesce(alt_text, '')), plainto_tsquery('english', p_query)) desc
  limit p_limit;
$$;

comment on table public.media_assets is 'Metadata for all AI-generated media assets with versioning support';
comment on column public.media_assets.logical_id is 'Stable identifier used in course JSON, allowing version changes without JSON updates';
comment on column public.media_assets.version is 'Version number, incremented on regeneration';
comment on column public.media_assets.prompt is 'AI prompt used to generate this asset';
comment on column public.media_assets.seed is 'Random seed for reproducible generation';
comment on column public.media_assets.moderation_flags is 'Provider-returned moderation flags (e.g., violence, sexual, hate)';
comment on column public.media_assets.usage_count is 'Number of active references to this asset';