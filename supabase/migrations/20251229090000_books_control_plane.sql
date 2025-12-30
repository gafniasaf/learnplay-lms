-- Books Control Plane (Canonical JSON + Overlays + Render Jobs + Artifacts)
-- Creates relational metadata + a durable job queue for Docker-based rendering/validation.
--
-- Canonical content and artifacts live in Storage (hybrid JSON storage).
-- The execution plane (Docker worker) reads jobs + inputs and uploads artifacts.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Storage bucket: books (private; access via Edge/service-role or signed URLs)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;

drop policy if exists "Service Role Manage Books" on storage.objects;
create policy "Service Role Manage Books"
on storage.objects
for all
using (bucket_id = 'books' and auth.role() = 'service_role')
with check (bucket_id = 'books' and auth.role() = 'service_role');

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.books (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  level text not null check (level in ('n3', 'n4')),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_books_org on public.books(organization_id);

drop trigger if exists update_books_updated_at on public.books;
create trigger update_books_updated_at
  before update on public.books
  for each row execute function public.update_updated_at_column();

alter table public.books enable row level security;

drop policy if exists "Superadmins can manage all books" on public.books;
create policy "Superadmins can manage all books"
  on public.books for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org books" on public.books;
create policy "Org users can read org books"
  on public.books for select
  using (organization_id in (select org_id from public.organization_users where user_id = auth.uid()));

drop policy if exists "Org editors can manage org books" on public.books;
create policy "Org editors can manage org books"
  on public.books for all
  using (
    organization_id in (
      select organization_id from public.user_roles
      where user_id = auth.uid() and role in ('org_admin', 'editor')
    )
  )
  with check (
    organization_id in (
      select organization_id from public.user_roles
      where user_id = auth.uid() and role in ('org_admin', 'editor')
    )
  );

-- ----------------------------------------------------------------------------
-- Book versions (immutable canonical inputs, versioned by book_version_id hash)
-- ----------------------------------------------------------------------------

create table if not exists public.book_versions (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references public.books(id) on delete cascade,
  book_version_id text not null,
  schema_version text not null default '1.0',
  source text,
  exported_at timestamptz,
  canonical_path text not null,
  figures_path text,
  design_tokens_path text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(book_id, book_version_id)
);

create index if not exists idx_book_versions_book on public.book_versions(book_id);
create index if not exists idx_book_versions_status on public.book_versions(status);

drop trigger if exists update_book_versions_updated_at on public.book_versions;
create trigger update_book_versions_updated_at
  before update on public.book_versions
  for each row execute function public.update_updated_at_column();

alter table public.book_versions enable row level security;

drop policy if exists "Superadmins can manage all book versions" on public.book_versions;
create policy "Superadmins can manage all book versions"
  on public.book_versions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book versions" on public.book_versions;
create policy "Org users can read org book versions"
  on public.book_versions for select
  using (
    book_id in (
      select id from public.books
      where organization_id in (select org_id from public.organization_users where user_id = auth.uid())
    )
  );

drop policy if exists "Org editors can manage org book versions" on public.book_versions;
create policy "Org editors can manage org book versions"
  on public.book_versions for all
  using (
    book_id in (
      select id from public.books
      where organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  )
  with check (
    book_id in (
      select id from public.books
      where organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Overlays (canonical-only edits) + paragraph-level rebase metadata
-- ----------------------------------------------------------------------------

create table if not exists public.book_overlays (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references public.books(id) on delete cascade,
  book_version_id text not null,
  overlay_path text not null,
  label text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'book_overlays_book_version_fk'
  ) then
    alter table public.book_overlays
      add constraint book_overlays_book_version_fk
      foreign key (book_id, book_version_id)
      references public.book_versions (book_id, book_version_id)
      on delete cascade;
  end if;
end $$;

create index if not exists idx_book_overlays_book on public.book_overlays(book_id, book_version_id);

drop trigger if exists update_book_overlays_updated_at on public.book_overlays;
create trigger update_book_overlays_updated_at
  before update on public.book_overlays
  for each row execute function public.update_updated_at_column();

alter table public.book_overlays enable row level security;

drop policy if exists "Superadmins can manage all book overlays" on public.book_overlays;
create policy "Superadmins can manage all book overlays"
  on public.book_overlays for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book overlays" on public.book_overlays;
create policy "Org users can read org book overlays"
  on public.book_overlays for select
  using (
    book_id in (
      select id from public.books
      where organization_id in (select org_id from public.organization_users where user_id = auth.uid())
    )
  );

drop policy if exists "Org editors can manage org book overlays" on public.book_overlays;
create policy "Org editors can manage org book overlays"
  on public.book_overlays for all
  using (
    book_id in (
      select id from public.books
      where organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  )
  with check (
    book_id in (
      select id from public.books
      where organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  );

create table if not exists public.book_overlay_paragraphs (
  id uuid primary key default gen_random_uuid(),
  overlay_id uuid not null references public.book_overlays(id) on delete cascade,
  paragraph_id uuid not null,
  basis_hash_at_edit text not null,
  created_at timestamptz not null default now(),
  unique(overlay_id, paragraph_id)
);

create index if not exists idx_book_overlay_paragraphs_overlay on public.book_overlay_paragraphs(overlay_id);

alter table public.book_overlay_paragraphs enable row level security;

drop policy if exists "Superadmins can manage all book overlay paragraphs" on public.book_overlay_paragraphs;
create policy "Superadmins can manage all book overlay paragraphs"
  on public.book_overlay_paragraphs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book overlay paragraphs" on public.book_overlay_paragraphs;
create policy "Org users can read org book overlay paragraphs"
  on public.book_overlay_paragraphs for select
  using (
    overlay_id in (
      select id from public.book_overlays
      where book_id in (
        select id from public.books
        where organization_id in (select org_id from public.organization_users where user_id = auth.uid())
      )
    )
  );

drop policy if exists "Org editors can manage org book overlay paragraphs" on public.book_overlay_paragraphs;
create policy "Org editors can manage org book overlay paragraphs"
  on public.book_overlay_paragraphs for all
  using (
    overlay_id in (
      select id from public.book_overlays
      where book_id in (
        select id from public.books
        where organization_id in (
          select organization_id from public.user_roles
          where user_id = auth.uid() and role in ('org_admin', 'editor')
        )
      )
    )
  )
  with check (
    overlay_id in (
      select id from public.book_overlays
      where book_id in (
        select id from public.books
        where organization_id in (
          select organization_id from public.user_roles
          where user_id = auth.uid() and role in ('org_admin', 'editor')
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Runs + per-chapter progress + artifacts
-- ----------------------------------------------------------------------------

create table if not exists public.book_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  book_version_id text not null,
  overlay_id uuid references public.book_overlays(id) on delete set null,
  target text not null check (target in ('chapter', 'book')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  render_provider text not null default 'prince_local' check (render_provider in ('prince_local', 'docraptor_api')),
  progress_stage text,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  progress_message text,
  error text,
  created_by uuid references auth.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'book_runs_book_version_fk'
  ) then
    alter table public.book_runs
      add constraint book_runs_book_version_fk
      foreign key (book_id, book_version_id)
      references public.book_versions (book_id, book_version_id)
      on delete cascade;
  end if;
end $$;

create index if not exists idx_book_runs_org on public.book_runs(organization_id);
create index if not exists idx_book_runs_book on public.book_runs(book_id, book_version_id);
create index if not exists idx_book_runs_status on public.book_runs(status);

drop trigger if exists update_book_runs_updated_at on public.book_runs;
create trigger update_book_runs_updated_at
  before update on public.book_runs
  for each row execute function public.update_updated_at_column();

alter table public.book_runs enable row level security;

drop policy if exists "Superadmins can manage all book runs" on public.book_runs;
create policy "Superadmins can manage all book runs"
  on public.book_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book runs" on public.book_runs;
create policy "Org users can read org book runs"
  on public.book_runs for select
  using (organization_id in (select org_id from public.organization_users where user_id = auth.uid()));

drop policy if exists "Org editors can manage org book runs" on public.book_runs;
create policy "Org editors can manage org book runs"
  on public.book_runs for all
  using (
    organization_id in (
      select organization_id from public.user_roles
      where user_id = auth.uid() and role in ('org_admin', 'editor')
    )
  )
  with check (
    organization_id in (
      select organization_id from public.user_roles
      where user_id = auth.uid() and role in ('org_admin', 'editor')
    )
  );

create table if not exists public.book_run_chapters (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.book_runs(id) on delete cascade,
  chapter_index integer not null check (chapter_index >= 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress_stage text,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  progress_message text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(run_id, chapter_index)
);

create index if not exists idx_book_run_chapters_run on public.book_run_chapters(run_id);
create index if not exists idx_book_run_chapters_status on public.book_run_chapters(status);

alter table public.book_run_chapters enable row level security;

drop policy if exists "Superadmins can manage all book run chapters" on public.book_run_chapters;
create policy "Superadmins can manage all book run chapters"
  on public.book_run_chapters for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book run chapters" on public.book_run_chapters;
create policy "Org users can read org book run chapters"
  on public.book_run_chapters for select
  using (
    run_id in (
      select id from public.book_runs
      where organization_id in (select org_id from public.organization_users where user_id = auth.uid())
    )
  );

drop policy if exists "Org editors can manage org book run chapters" on public.book_run_chapters;
create policy "Org editors can manage org book run chapters"
  on public.book_run_chapters for all
  using (
    run_id in (
      select id from public.book_runs
      where organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  )
  with check (
    run_id in (
      select id from public.book_runs
      where organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  );

create table if not exists public.book_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.book_runs(id) on delete cascade,
  chapter_index integer,
  kind text not null check (kind in ('canonical', 'overlay', 'assembled', 'html', 'pdf', 'layout_report', 'prince_log', 'debug')),
  path text not null,
  sha256 text,
  bytes bigint,
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_book_artifacts_run on public.book_artifacts(run_id);
create index if not exists idx_book_artifacts_kind on public.book_artifacts(kind);

alter table public.book_artifacts enable row level security;

drop policy if exists "Superadmins can manage all book artifacts" on public.book_artifacts;
create policy "Superadmins can manage all book artifacts"
  on public.book_artifacts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book artifacts" on public.book_artifacts;
create policy "Org users can read org book artifacts"
  on public.book_artifacts for select
  using (
    run_id in (
      select id from public.book_runs
      where organization_id in (select org_id from public.organization_users where user_id = auth.uid())
    )
  );

drop policy if exists "Org editors can manage org book artifacts" on public.book_artifacts;
create policy "Org editors can manage org book artifacts"
  on public.book_artifacts for all
  using (
    run_id in (
      select id from public.book_runs
      where organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  )
  with check (
    run_id in (
      select id from public.book_runs
      where organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Job queue: book_render_jobs (processed by Docker worker)
-- ----------------------------------------------------------------------------

create table if not exists public.book_render_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.book_runs(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  book_version_id text not null,
  overlay_id uuid references public.book_overlays(id) on delete set null,
  chapter_index integer,
  target text not null check (target in ('chapter', 'book')),
  render_provider text not null default 'prince_local' check (render_provider in ('prince_local', 'docraptor_api')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'dead_letter', 'stale')),
  result_path text,
  error text,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  last_heartbeat timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  progress_stage text,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  progress_message text,
  processing_duration_ms bigint
);

create index if not exists idx_book_render_jobs_status on public.book_render_jobs(status);
create index if not exists idx_book_render_jobs_org on public.book_render_jobs(organization_id);
create index if not exists idx_book_render_jobs_run on public.book_render_jobs(run_id);
create index if not exists idx_book_render_jobs_book on public.book_render_jobs(book_id, book_version_id);

drop trigger if exists book_render_jobs_set_updated_at on public.book_render_jobs;
create trigger book_render_jobs_set_updated_at
  before update on public.book_render_jobs
  for each row execute function public.set_updated_at();

alter table public.book_render_jobs enable row level security;

drop policy if exists "Superadmins can manage all book render jobs" on public.book_render_jobs;
create policy "Superadmins can manage all book render jobs"
  on public.book_render_jobs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book render jobs" on public.book_render_jobs;
create policy "Org users can read org book render jobs"
  on public.book_render_jobs for select
  using (organization_id in (select org_id from public.organization_users where user_id = auth.uid()));

drop policy if exists "Org editors can manage org book render jobs" on public.book_render_jobs;
create policy "Org editors can manage org book render jobs"
  on public.book_render_jobs for all
  using (
    organization_id in (
      select organization_id from public.user_roles
      where user_id = auth.uid() and role in ('org_admin', 'editor')
    )
  )
  with check (
    organization_id in (
      select organization_id from public.user_roles
      where user_id = auth.uid() and role in ('org_admin', 'editor')
    )
  );

-- ============================================================================
-- Queue helper functions (book jobs) + extend existing helpers
-- ============================================================================

drop function if exists public.get_next_pending_book_job();
create or replace function public.get_next_pending_book_job()
returns setof public.book_render_jobs as $$
declare
  job_row public.book_render_jobs;
begin
  select *
  into job_row
  from public.book_render_jobs
  where (status = 'pending')
     or (status = 'failed' and retry_count < max_retries)
  order by created_at asc
  limit 1
  for update skip locked;

  if job_row.id is not null then
    if job_row.status = 'failed' then
      update public.book_render_jobs
      set status = 'processing',
          started_at = now(),
          retry_count = retry_count + 1,
          last_heartbeat = now()
      where id = job_row.id;
    else
      update public.book_render_jobs
      set status = 'processing',
          started_at = now(),
          last_heartbeat = now()
      where id = job_row.id;
    end if;

    return query
      select * from public.book_render_jobs where id = job_row.id;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.get_next_pending_book_job() to service_role;

-- Heartbeat updater (extend to book_render_jobs)
create or replace function public.update_job_heartbeat(job_id uuid, job_table text)
returns void as $$
begin
  if job_table = 'ai_course_jobs' then
    update public.ai_course_jobs
    set last_heartbeat = now()
    where id = job_id;
  elsif job_table = 'ai_media_jobs' then
    update public.ai_media_jobs
    set last_heartbeat = now()
    where id = job_id;
  elsif job_table = 'book_render_jobs' then
    update public.book_render_jobs
    set last_heartbeat = now()
    where id = job_id;
  else
    raise exception 'Invalid job table: %', job_table;
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.update_job_heartbeat(uuid, text) to service_role;

-- Mark stale jobs (robust set-returning implementation; includes book jobs)
create or replace function public.mark_stale_jobs()
returns table(job_id uuid, job_type text, stale_duration interval) as $$
declare
  stale_threshold interval := interval '5 minutes';
begin
  return query
    update public.ai_course_jobs
    set status = 'stale',
        error = 'Job marked stale due to heartbeat timeout'
    where status = 'processing'
      and last_heartbeat < now() - stale_threshold
    returning id, 'course'::text, now() - last_heartbeat;

  return query
    update public.ai_media_jobs
    set status = 'stale',
        error = 'Job marked stale due to heartbeat timeout'
    where status = 'processing'
      and last_heartbeat < now() - stale_threshold
    returning id, 'media'::text, now() - last_heartbeat;

  return query
    update public.book_render_jobs
    set status = 'stale',
        error = 'Job marked stale due to heartbeat timeout'
    where status = 'processing'
      and last_heartbeat < now() - stale_threshold
    returning id, 'book'::text, now() - last_heartbeat;
end;
$$ language plpgsql security definer;

grant execute on function public.mark_stale_jobs() to service_role;

-- Move exhausted jobs to dead_letter (robust set-returning implementation; includes book jobs)
create or replace function public.move_to_dead_letter()
returns table(job_id uuid, job_type text, final_error text) as $$
begin
  return query
    update public.ai_course_jobs
    set status = 'dead_letter',
        error = coalesce(error, 'Max retries exceeded') || format(' (retries: %s/%s)', retry_count, max_retries),
        completed_at = now()
    where status = 'failed'
      and retry_count >= max_retries
    returning id, 'course'::text, error;

  return query
    update public.ai_media_jobs
    set status = 'dead_letter',
        error = coalesce(error, 'Max retries exceeded') || format(' (retries: %s/%s)', retry_count, max_retries),
        completed_at = now()
    where status = 'failed'
      and retry_count >= max_retries
    returning id, 'media'::text, error;

  return query
    update public.book_render_jobs
    set status = 'dead_letter',
        error = coalesce(error, 'Max retries exceeded') || format(' (retries: %s/%s)', retry_count, max_retries),
        completed_at = now()
    where status = 'failed'
      and retry_count >= max_retries
    returning id, 'book'::text, error;
end;
$$ language plpgsql security definer;

grant execute on function public.move_to_dead_letter() to service_role;

-- Requeue helper (extend to book_render_jobs)
create or replace function public.requeue_job(job_id uuid, job_table text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if job_table = 'ai_course_jobs' then
    update public.ai_course_jobs
    set status = 'pending',
        retry_count = 0,
        error = null,
        started_at = null,
        completed_at = null,
        last_heartbeat = null
    where id = job_id
      and status in ('failed','dead_letter','stale');

  elsif job_table = 'ai_media_jobs' then
    update public.ai_media_jobs
    set status = 'pending',
        retry_count = 0,
        error = null,
        started_at = null,
        completed_at = null,
        last_heartbeat = null
    where id = job_id
      and status in ('failed','dead_letter','stale');

  elsif job_table = 'book_render_jobs' then
    update public.book_render_jobs
    set status = 'pending',
        retry_count = 0,
        error = null,
        started_at = null,
        completed_at = null,
        last_heartbeat = null
    where id = job_id
      and status in ('failed','dead_letter','stale');

  else
    raise exception 'Invalid job table: %', job_table;
  end if;
end;
$$;

grant execute on function public.requeue_job(uuid, text) to authenticated, service_role;

create or replace function public.requeue_book_render_job(p_job_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.requeue_job(p_job_id, 'book_render_jobs');
$$;

grant execute on function public.requeue_book_render_job(uuid) to authenticated, service_role;


