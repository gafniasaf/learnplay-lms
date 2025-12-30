-- Book → E-learning Linkage
-- Tracks which Course study texts / derived courses were generated from which BookVersion/Overlay.
-- Enables "stale" invalidation when overlays change.

create extension if not exists "pgcrypto";

create table if not exists public.book_elearning_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  book_version_id text not null,
  overlay_id uuid references public.book_overlays(id) on delete set null,
  kind text not null check (kind in ('study_text', 'derived_course')),
  course_id text not null,
  study_text_id text,
  derived_job_id uuid,
  source_paragraph_ids jsonb not null default '[]'::jsonb,
  overlay_updated_at_at_link timestamptz,
  stale boolean not null default false,
  stale_reason text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ensure uniqueness per course target
  unique(course_id, kind, study_text_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'book_elearning_links_book_version_fk'
  ) then
    alter table public.book_elearning_links
      add constraint book_elearning_links_book_version_fk
      foreign key (book_id, book_version_id)
      references public.book_versions (book_id, book_version_id)
      on delete cascade;
  end if;
end $$;

create index if not exists idx_book_elearning_links_org on public.book_elearning_links(organization_id);
create index if not exists idx_book_elearning_links_book on public.book_elearning_links(book_id, book_version_id);
create index if not exists idx_book_elearning_links_overlay on public.book_elearning_links(overlay_id);
create index if not exists idx_book_elearning_links_course on public.book_elearning_links(course_id);
create index if not exists idx_book_elearning_links_stale on public.book_elearning_links(stale);

drop trigger if exists update_book_elearning_links_updated_at on public.book_elearning_links;
create trigger update_book_elearning_links_updated_at
  before update on public.book_elearning_links
  for each row execute function public.update_updated_at_column();

alter table public.book_elearning_links enable row level security;

drop policy if exists "Service role can manage book elearning links" on public.book_elearning_links;
create policy "Service role can manage book elearning links"
  on public.book_elearning_links for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read book elearning links" on public.book_elearning_links;
create policy "Org users can read book elearning links"
  on public.book_elearning_links for select
  using (organization_id in (select org_id from public.organization_users where user_id = auth.uid()));

drop policy if exists "Org editors can manage book elearning links" on public.book_elearning_links;
create policy "Org editors can manage book elearning links"
  on public.book_elearning_links for all
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


