-- Private materials bucket (org-scoped) for teacher uploads + derived artifacts (extracted text, chunks, etc.)
-- NOTE: We enforce org isolation by requiring the first path segment to equal the user's organization_id.
-- We read organization_id from the Supabase JWT (app_metadata preferred, fallback to user_metadata).

-- 1) Bucket
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do update set public = false;

-- 2) RLS policies on storage.objects for the materials bucket
-- Drop first to keep migration idempotent
drop policy if exists "materials_org_read" on storage.objects;
drop policy if exists "materials_org_insert" on storage.objects;
drop policy if exists "materials_org_update" on storage.objects;
drop policy if exists "materials_org_delete" on storage.objects;

-- Read: authenticated users can read objects scoped to their org prefix
create policy "materials_org_read"
on storage.objects
for select
using (
  bucket_id = 'materials'
  and split_part(name, '/', 1) = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'organization_id',
    auth.jwt() -> 'user_metadata' ->> 'organization_id'
  )
);

-- Insert: authenticated users can upload only into their org prefix
create policy "materials_org_insert"
on storage.objects
for insert
with check (
  bucket_id = 'materials'
  and split_part(name, '/', 1) = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'organization_id',
    auth.jwt() -> 'user_metadata' ->> 'organization_id'
  )
);

-- Update: authenticated users can update metadata only within their org prefix
create policy "materials_org_update"
on storage.objects
for update
using (
  bucket_id = 'materials'
  and split_part(name, '/', 1) = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'organization_id',
    auth.jwt() -> 'user_metadata' ->> 'organization_id'
  )
)
with check (
  bucket_id = 'materials'
  and split_part(name, '/', 1) = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'organization_id',
    auth.jwt() -> 'user_metadata' ->> 'organization_id'
  )
);

-- Delete: authenticated users can delete objects only within their org prefix
create policy "materials_org_delete"
on storage.objects
for delete
using (
  bucket_id = 'materials'
  and split_part(name, '/', 1) = coalesce(
    auth.jwt() -> 'app_metadata' ->> 'organization_id',
    auth.jwt() -> 'user_metadata' ->> 'organization_id'
  )
);


