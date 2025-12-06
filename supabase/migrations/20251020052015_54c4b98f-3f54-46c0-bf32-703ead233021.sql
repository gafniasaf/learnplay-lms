-- Storage policies for 'courses' bucket
-- Public read access for course JSON files
CREATE POLICY "storage_courses_public_read" 
ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'courses');

-- Admin-only INSERT access
CREATE POLICY "storage_courses_admin_write" 
ON storage.objects
FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'courses' 
  AND EXISTS (
    SELECT 1 
    FROM public.profiles p 
    WHERE p.id = auth.uid() 
      AND p.role = 'admin'
  )
);

-- Admin-only UPDATE access
CREATE POLICY "storage_courses_admin_update" 
ON storage.objects
FOR UPDATE 
TO authenticated
USING (
  bucket_id = 'courses' 
  AND EXISTS (
    SELECT 1 
    FROM public.profiles p 
    WHERE p.id = auth.uid() 
      AND p.role = 'admin'
  )
)
WITH CHECK (bucket_id = 'courses');

-- Admin-only DELETE access
CREATE POLICY "storage_courses_admin_delete" 
ON storage.objects
FOR DELETE 
TO authenticated
USING (
  bucket_id = 'courses' 
  AND EXISTS (
    SELECT 1 
    FROM public.profiles p 
    WHERE p.id = auth.uid() 
      AND p.role = 'admin'
  )
);