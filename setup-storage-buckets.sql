-- Setup Storage Buckets and Policies
-- Run this in your Supabase SQL Editor to create the required storage buckets

-- Create courses bucket (public, for course JSON files)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'courses',
  'courses',
  true,
  10485760, -- 10MB limit
  array['application/json']
)
on conflict (id) do nothing;

-- Create media-library bucket (public, for images, videos, audio)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-library',
  'media-library',
  true,
  52428800, -- 50MB limit
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do nothing;

-- RLS Policies for courses bucket
create policy if not exists "Public read access to courses"
on storage.objects for select
using (bucket_id = 'courses');

create policy if not exists "Authenticated users can upload courses"
on storage.objects for insert
to authenticated
with check (bucket_id = 'courses');

create policy if not exists "Authenticated users can update courses"
on storage.objects for update
to authenticated
using (bucket_id = 'courses');

create policy if not exists "Authenticated users can delete courses"
on storage.objects for delete
to authenticated
using (bucket_id = 'courses');

-- RLS Policies for media-library bucket
create policy if not exists "Public read access to media"
on storage.objects for select
using (bucket_id = 'media-library');

create policy if not exists "Authenticated users can upload media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'media-library');

create policy if not exists "Authenticated users can update media"
on storage.objects for update
to authenticated
using (bucket_id = 'media-library');

create policy if not exists "Authenticated users can delete media"
on storage.objects for delete
to authenticated
using (bucket_id = 'media-library');
