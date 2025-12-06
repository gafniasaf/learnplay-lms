-- Idempotent bucket + policy for courses
insert into storage.buckets (id, name, public)
values ('courses','courses', true)
on conflict (id) do update set public = true;

-- Drop existing policy if it exists
drop policy if exists "courses public read" on storage.objects;

-- Create public read policy for courses bucket
create policy "courses public read"
on storage.objects for select
to public
using (bucket_id = 'courses');