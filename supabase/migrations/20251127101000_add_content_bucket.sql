insert into storage.buckets (id, name, public)
values ('content', 'content', true)
on conflict (id) do nothing;

create policy "Public Access" on storage.objects for select
using ( bucket_id = 'content' );

create policy "Authenticated Insert" on storage.objects for insert
with check ( bucket_id = 'content' and auth.role() = 'authenticated' );

create policy "Service Role All" on storage.objects for all
using ( auth.role() = 'service_role' );

