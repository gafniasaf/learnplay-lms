-- Book Studio: Version history for overlays + image library mappings
--
-- Adds:
-- - book_overlay_versions: immutable snapshots of overlay JSON (stored in Storage)
-- - book_image_versions: append-only history of canonicalSrc -> storagePath mapping changes

create table if not exists public.book_overlay_versions (
  id uuid primary key default gen_random_uuid(),
  overlay_id uuid not null references public.book_overlays(id) on delete cascade,
  snapshot_path text not null,
  created_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_book_overlay_versions_overlay on public.book_overlay_versions(overlay_id);
create index if not exists idx_book_overlay_versions_created_at on public.book_overlay_versions(created_at desc);

alter table public.book_overlay_versions enable row level security;

drop policy if exists "Superadmins can manage all book overlay versions" on public.book_overlay_versions;
create policy "Superadmins can manage all book overlay versions"
  on public.book_overlay_versions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book overlay versions" on public.book_overlay_versions;
create policy "Org users can read org book overlay versions"
  on public.book_overlay_versions for select
  using (
    overlay_id in (
      select o.id from public.book_overlays o
      where o.book_id in (
        select b.id from public.books b
        where b.organization_id in (select org_id from public.organization_users where user_id = auth.uid())
      )
    )
  );

drop policy if exists "Org editors can manage org book overlay versions" on public.book_overlay_versions;
create policy "Org editors can manage org book overlay versions"
  on public.book_overlay_versions for all
  using (
    overlay_id in (
      select o.id from public.book_overlays o
      where o.book_id in (
        select b.id from public.books b
        where b.organization_id in (
          select organization_id from public.user_roles
          where user_id = auth.uid() and role in ('org_admin', 'editor')
        )
      )
    )
  )
  with check (
    overlay_id in (
      select o.id from public.book_overlays o
      where o.book_id in (
        select b.id from public.books b
        where b.organization_id in (
          select organization_id from public.user_roles
          where user_id = auth.uid() and role in ('org_admin', 'editor')
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Image mapping versions (canonicalSrc -> storagePath changes)
-- -----------------------------------------------------------------------------

create table if not exists public.book_image_versions (
  id uuid primary key default gen_random_uuid(),
  book_id text not null references public.books(id) on delete cascade,
  canonical_src text not null,
  storage_path text not null,
  action text not null default 'upsert' check (action in ('upsert', 'generate', 'revert')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_book_image_versions_book_src on public.book_image_versions(book_id, canonical_src);
create index if not exists idx_book_image_versions_created_at on public.book_image_versions(created_at desc);

alter table public.book_image_versions enable row level security;

drop policy if exists "Superadmins can manage all book image versions" on public.book_image_versions;
create policy "Superadmins can manage all book image versions"
  on public.book_image_versions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Org users can read org book image versions" on public.book_image_versions;
create policy "Org users can read org book image versions"
  on public.book_image_versions for select
  using (
    book_id in (
      select b.id from public.books b
      where b.organization_id in (select org_id from public.organization_users where user_id = auth.uid())
    )
  );

drop policy if exists "Org editors can manage org book image versions" on public.book_image_versions;
create policy "Org editors can manage org book image versions"
  on public.book_image_versions for all
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


