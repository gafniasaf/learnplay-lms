-- Media Assets metadata table for cross-course reuse and versioning

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  
  -- Asset identification
  logical_id text not null,  -- Stable ID referenced in course JSON (e.g., 'liver-anatomy-v2')
  version integer not null default 1,
  
  -- Storage
  storage_path text not null,  -- Full Supabase Storage path
  storage_bucket text not null default 'courses',
  public_url text not null,
  
  -- Media details
  media_type text not null check (media_type in ('image', 'audio', 'video')),
  mime_type text,
  file_size_bytes integer,
  duration_seconds numeric(10, 2),  -- For audio/video
  dimensions jsonb,  -- {width, height} for images/video
  
  -- Generation metadata
  provider text not null,  -- FK to media_generation_providers.id
  model text,  -- Specific model used (e.g., 'dall-e-3', 'sdxl')
  prompt text not null,
  style text,  -- 'diagram', 'photo', 'illustration', etc.
  seed text,  -- For reproducible generation
  cost_usd numeric(10, 4),
  
  -- Ownership and tracking
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  
  -- Status and moderation
  status text not null default 'active' check (status in ('active', 'archived', 'quarantined', 'deleted')),
  moderation_status text check (moderation_status in ('approved', 'pending', 'flagged', 'rejected')),
  moderation_flags jsonb,  -- Provider moderation flags
  
  -- Usage tracking
  usage_count integer default 0,  -- How many courses/items use this
  last_used_at timestamptz,
  
  -- Additional metadata
  alt_text text,
  caption text,
  metadata jsonb default '{}'::jsonb,
  
  -- Constraints
  unique(logical_id, version)
);

alter table public.media_assets enable row level security;

-- Anyone can view active assets
create policy "Anyone can view active assets"
  on public.media_assets for select
  using (status = 'active' and (moderation_status is null or moderation_status = 'approved'));

-- Creators can view their own assets regardless of status
create policy "Creators can view own assets"
  on public.media_assets for select
  using (created_by = auth.uid());

-- Authenticated users can insert assets
create policy "Authenticated can insert assets"
  on public.media_assets for insert
  to authenticated
  with check (created_by = auth.uid());

-- Creators can update their own assets
create policy "Creators can update own assets"
  on public.media_assets for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Admins can do everything
create policy "Admins can manage all assets"
  on public.media_assets for all
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

-- Indexes
create index if not exists media_assets_logical_id_idx on public.media_assets(logical_id);
create index if not exists media_assets_provider_idx on public.media_assets(provider);
create index if not exists media_assets_media_type_idx on public.media_assets(media_type);
create index if not exists media_assets_created_by_idx on public.media_assets(created_by);
create index if not exists media_assets_status_idx on public.media_assets(status) where status = 'active';
create index if not exists media_assets_moderation_idx on public.media_assets(moderation_status) where moderation_status = 'pending';

-- Full-text search on prompt and alt_text
create index if not exists media_assets_prompt_search_idx on public.media_assets using gin(to_tsvector('english', prompt || ' ' || coalesce(alt_text, '')));

-- Function to increment usage count
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

-- Function to find latest version of an asset
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

-- Function to search similar prompts
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

