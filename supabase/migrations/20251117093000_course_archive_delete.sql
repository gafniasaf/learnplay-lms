-- Archive/Delete lifecycle for courses
-- Adds archived_at/by and deleted_at/by columns to course_metadata
-- Updates RLS to exclude archived (for non-superadmin) and deleted rows by default

-- Columns
alter table if exists public.course_metadata
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid null references auth.users(id),
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id);

-- Indexes
create index if not exists idx_course_metadata_archived_at on public.course_metadata(archived_at);
create index if not exists idx_course_metadata_deleted_at on public.course_metadata(deleted_at);

-- RLS: Update SELECT policy to hide deleted rows, and hide archived rows unless superadmin
do $$
begin
  if exists(
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'course_metadata' 
      and policyname = 'Org users can read org and global courses'
  ) then
    drop policy "Org users can read org and global courses" on public.course_metadata;
  end if;
end $$;

create policy "Org users can read org and global courses"
  on public.course_metadata for select
  using (
    (organization_id in (select get_user_org_ids()) or visibility = 'global')
    and deleted_at is null
    and (archived_at is null or is_superadmin())
  );

-- Optional helpers (no-op if they already exist). These comments are here for maintainers:
-- - Superadmins still have full access via the existing "Superadmins can manage all course metadata" policy.
-- - Editors/org_admins manage org courses; archive/delete operations will rely on Edge Functions for authorization checks.


