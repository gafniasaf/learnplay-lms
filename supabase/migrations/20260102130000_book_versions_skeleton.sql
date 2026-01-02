-- Book Studio (Skeleton-first): Skeleton storage + version history
--
-- Adds:
-- - book_versions.skeleton_path / compiled_canonical_path (hybrid storage paths in 'books' bucket)
-- - book_skeleton_versions: immutable snapshots of skeleton JSON (append-only history)
--
-- NOTE: We keep authoring_mode extensible ('legacy'|'skeleton') to avoid breaking existing versions
-- during bulk migration. The upgrade flow will backfill skeletons and then flip versions to 'skeleton'.

-- -----------------------------------------------------------------------------
-- book_versions columns
-- -----------------------------------------------------------------------------

alter table public.book_versions
  add column if not exists skeleton_path text;

alter table public.book_versions
  add column if not exists compiled_canonical_path text;

alter table public.book_versions
  add column if not exists skeleton_schema_version text not null default 'skeleton_v1';

alter table public.book_versions
  add column if not exists authoring_mode text not null default 'legacy'
    check (authoring_mode in ('legacy', 'skeleton'));

alter table public.book_versions
  add column if not exists prompt_pack_id text;

alter table public.book_versions
  add column if not exists prompt_pack_version integer;

create index if not exists idx_book_versions_authoring_mode
  on public.book_versions(authoring_mode);

-- -----------------------------------------------------------------------------
-- book_skeleton_versions (immutable history)
-- -----------------------------------------------------------------------------

create table if not exists public.book_skeleton_versions (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references public.books(id) on delete cascade,
  book_version_id text not null,
  snapshot_path text not null,
  created_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'book_skeleton_versions_book_version_fk'
  ) then
    alter table public.book_skeleton_versions
      add constraint book_skeleton_versions_book_version_fk
      foreign key (book_id, book_version_id)
      references public.book_versions (book_id, book_version_id)
      on delete cascade;
  end if;
end $$;

create index if not exists idx_book_skeleton_versions_book on public.book_skeleton_versions(book_id, book_version_id);
create index if not exists idx_book_skeleton_versions_created_at on public.book_skeleton_versions(created_at desc);

alter table public.book_skeleton_versions enable row level security;

drop policy if exists "Superadmins can manage all book skeleton versions" on public.book_skeleton_versions;
create policy "Superadmins can manage all book skeleton versions"
  on public.book_skeleton_versions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book skeleton versions" on public.book_skeleton_versions;
create policy "Org users can read org book skeleton versions"
  on public.book_skeleton_versions for select
  using (
    book_id in (
      select b.id from public.books b
      where b.organization_id in (select org_id from public.organization_users where user_id = auth.uid())
    )
  );

drop policy if exists "Org editors can manage org book skeleton versions" on public.book_skeleton_versions;
create policy "Org editors can manage org book skeleton versions"
  on public.book_skeleton_versions for all
  using (
    book_id in (
      select b.id from public.books b
      where b.organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  )
  with check (
    book_id in (
      select b.id from public.books b
      where b.organization_id in (
        select organization_id from public.user_roles
        where user_id = auth.uid() and role in ('org_admin', 'editor')
      )
    )
  );


