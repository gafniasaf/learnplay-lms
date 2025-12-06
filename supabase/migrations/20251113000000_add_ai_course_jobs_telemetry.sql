-- Add telemetry and progress fields to ai_course_jobs
-- Supports provider metrics, token usage, cost tracking, reason codes

-- Add provider and model tracking
alter table public.ai_course_jobs add column if not exists provider text;
alter table public.ai_course_jobs add column if not exists model text;

-- Add attempt and retry tracking
alter table public.ai_course_jobs add column if not exists attempts integer default 1;

-- Add token usage metrics
alter table public.ai_course_jobs add column if not exists tokens integer;

-- Add cost tracking
alter table public.ai_course_jobs add column if not exists cost_usd numeric(10, 4);

-- Add latency tracking (milliseconds)
alter table public.ai_course_jobs add column if not exists latency_ms integer;

-- Add reason code for failures or fallbacks
alter table public.ai_course_jobs add column if not exists reason_code text;

-- Add progress tracking fields
alter table public.ai_course_jobs add column if not exists progress_stage text;
alter table public.ai_course_jobs add column if not exists progress_percent integer default 0 check (progress_percent between 0 and 100);
alter table public.ai_course_jobs add column if not exists progress_message text;

-- Add indexes for common queries
create index if not exists ai_course_jobs_provider_idx on public.ai_course_jobs(provider);
create index if not exists ai_course_jobs_progress_stage_idx on public.ai_course_jobs(progress_stage);
create index if not exists ai_course_jobs_created_at_idx on public.ai_course_jobs(created_at desc);

-- Add comment documenting telemetry fields
comment on column public.ai_course_jobs.provider is 'AI provider used (anthropic, openai, azure_openai)';
comment on column public.ai_course_jobs.model is 'Model name (e.g., claude-3-5-sonnet-20241022, gpt-4o-mini)';
comment on column public.ai_course_jobs.attempts is 'Number of generation attempts (includes retries)';
comment on column public.ai_course_jobs.tokens is 'Total tokens used (input + output)';
comment on column public.ai_course_jobs.cost_usd is 'Estimated cost in USD';
comment on column public.ai_course_jobs.latency_ms is 'Total latency in milliseconds';
comment on column public.ai_course_jobs.reason_code is 'Error/fallback reason code (e.g., invalid_json, timeout, placeholder_fallback)';
comment on column public.ai_course_jobs.progress_stage is 'Current pipeline stage (calling_ai, validating, enriching, generating_images, completed)';
comment on column public.ai_course_jobs.progress_percent is 'Progress percentage (0-100)';
comment on column public.ai_course_jobs.progress_message is 'Human-readable progress message';
