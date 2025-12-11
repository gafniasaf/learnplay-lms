-- Setup Additional Storage Buckets for Edge Functions
-- Run this in your Supabase SQL Editor to create the required storage buckets

-- Create mockups bucket (public, for blueprint library HTML files)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mockups',
  'mockups',
  true,
  5242880, -- 5MB limit
  array['text/html', 'text/plain']
)
on conflict (id) do nothing;

-- Create releases bucket (public, for downloadable release files)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'releases',
  'releases',
  true,
  104857600, -- 100MB limit
  array['application/zip', 'application/octet-stream']
)
on conflict (id) do nothing;

-- RLS Policies for mockups bucket
create policy if not exists "Public read access to mockups"
on storage.objects for select
using (bucket_id = 'mockups');

create policy if not exists "Authenticated users can upload mockups"
on storage.objects for insert
to authenticated
with check (bucket_id = 'mockups');

create policy if not exists "Authenticated users can update mockups"
on storage.objects for update
to authenticated
using (bucket_id = 'mockups');

create policy if not exists "Authenticated users can delete mockups"
on storage.objects for delete
to authenticated
using (bucket_id = 'mockups');

-- RLS Policies for releases bucket
create policy if not exists "Public read access to releases"
on storage.objects for select
using (bucket_id = 'releases');

create policy if not exists "Service role can upload releases"
on storage.objects for insert
to service_role
with check (bucket_id = 'releases');

create policy if not exists "Service role can update releases"
on storage.objects for update
to service_role
using (bucket_id = 'releases');

create policy if not exists "Service role can delete releases"
on storage.objects for delete
to service_role
using (bucket_id = 'releases');


