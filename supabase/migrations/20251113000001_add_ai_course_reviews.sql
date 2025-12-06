-- Create ai_course_reviews table for semantic quality scoring
-- Stores reviewer scores per job/course generation attempt

create table if not exists public.ai_course_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.ai_course_jobs(id) on delete cascade,
  overall numeric(3, 2) check (overall between 0 and 1),
  clarity numeric(3, 2) check (clarity between 0 and 1),
  age_fit numeric(3, 2) check (age_fit between 0 and 1),
  correctness numeric(3, 2) check (correctness between 0 and 1),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.ai_course_reviews enable row level security;

-- Allow job owners to select reviews for their jobs
create policy ai_course_reviews_select_own
  on public.ai_course_reviews
  for select
  using (
    exists (
      select 1 from public.ai_course_jobs
      where ai_course_jobs.id = ai_course_reviews.job_id
      and ai_course_jobs.created_by = auth.uid()
    )
  );

-- Service role can insert reviews (no direct user insertion)
-- RLS bypassed for service key; no insert policy needed for users

-- Add index for common queries
create index if not exists ai_course_reviews_job_id_idx on public.ai_course_reviews(job_id);
create index if not exists ai_course_reviews_overall_idx on public.ai_course_reviews(overall);
create index if not exists ai_course_reviews_created_at_idx on public.ai_course_reviews(created_at desc);

-- Add comments
comment on table public.ai_course_reviews is 'Semantic quality scores from AI reviewer for course generation jobs';
comment on column public.ai_course_reviews.job_id is 'References ai_course_jobs.id';
comment on column public.ai_course_reviews.overall is 'Overall quality score (0-1); threshold for publication is 0.75';
comment on column public.ai_course_reviews.clarity is 'Clarity score (0-1): questions unambiguous, instructions clear';
comment on column public.ai_course_reviews.age_fit is 'Age appropriateness score (0-1): language and difficulty suitable for grade level';
comment on column public.ai_course_reviews.correctness is 'Factual accuracy score (0-1): no misconceptions or errors';
comment on column public.ai_course_reviews.notes is 'Detailed feedback and suggestions from reviewer';
