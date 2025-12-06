-- Media Generation Providers Table
-- Stores configuration and metadata for AI media generation providers (DALL-E, Stable Diffusion, etc.)

create table if not exists public.media_generation_providers (
  id text primary key,  -- e.g., 'openai-dalle3', 'replicate-sd', 'elevenlabs-tts'
  name text not null,
  media_types text[] not null,  -- ['image'], ['audio'], ['video']
  enabled boolean default true,
  cost_per_unit numeric(10, 4),  -- USD per generation
  avg_generation_time_seconds integer,  -- Average time in seconds
  quality_rating integer check (quality_rating >= 1 and quality_rating <= 5),  -- 1-5 stars
  config jsonb default '{}'::jsonb,  -- Provider-specific config (model, size, etc.)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: Admin read/write, others read-only
alter table public.media_generation_providers enable row level security;

create policy "Anyone can view enabled providers"
  on public.media_generation_providers for select
  using (enabled = true);

create policy "Admins can manage providers"
  on public.media_generation_providers for all
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');

-- Insert default providers
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

-- Function to get providers by media type
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

-- Index for fast lookups
create index if not exists idx_providers_media_types on public.media_generation_providers using gin(media_types);
create index if not exists idx_providers_enabled on public.media_generation_providers(enabled) where enabled = true;

comment on table public.media_generation_providers is 'Configuration and metadata for AI media generation providers';
comment on column public.media_generation_providers.config is 'Provider-specific settings (JSON): model, voices, sizes, etc.';

