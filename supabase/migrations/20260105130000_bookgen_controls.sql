-- BookGen Controls (pause/resume/cancel)
-- Stores per-book-version control state for the BookGen Pro orchestrator.
-- NOTE: Orchestrators must check this table BEFORE enqueueing the next chapter.

create extension if not exists "pgcrypto";

create table if not exists public.bookgen_controls (
  book_id text not null references public.books(id) on delete cascade,
  book_version_id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  paused boolean not null default false,
  cancelled boolean not null default false,
  note text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (book_id, book_version_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookgen_controls_book_version_fk'
  ) then
    alter table public.bookgen_controls
      add constraint bookgen_controls_book_version_fk
      foreign key (book_id, book_version_id)
      references public.book_versions (book_id, book_version_id)
      on delete cascade;
  end if;
end $$;

create index if not exists idx_bookgen_controls_org on public.bookgen_controls(organization_id);
create index if not exists idx_bookgen_controls_book on public.bookgen_controls(book_id, book_version_id);

drop trigger if exists update_bookgen_controls_updated_at on public.bookgen_controls;
create trigger update_bookgen_controls_updated_at
  before update on public.bookgen_controls
  for each row execute function public.update_updated_at_column();

alter table public.bookgen_controls enable row level security;

drop policy if exists "Superadmins can manage all bookgen controls" on public.bookgen_controls;
create policy "Superadmins can manage all bookgen controls"
  on public.bookgen_controls for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org bookgen controls" on public.bookgen_controls;
create policy "Org users can read org bookgen controls"
  on public.bookgen_controls for select
  using (
    organization_id in (select org_id from public.organization_users where user_id = auth.uid())
  );

drop policy if exists "Org editors can manage org bookgen controls" on public.bookgen_controls;
create policy "Org editors can manage org bookgen controls"
  on public.bookgen_controls for all
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


