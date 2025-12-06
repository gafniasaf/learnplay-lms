-- Allow only admins to write to 'courses' bucket
create policy "courses admin write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'courses'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "courses admin update"
on storage.objects for update to authenticated
using (
  bucket_id = 'courses'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  bucket_id = 'courses'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);