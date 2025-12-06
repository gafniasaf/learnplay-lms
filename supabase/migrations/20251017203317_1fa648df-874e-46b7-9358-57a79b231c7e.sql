-- ============================================
-- Storage Policies: Public Read, Service Role Write
-- ============================================

-- Drop any existing permissive write policies on storage.objects for 'courses' bucket
DROP POLICY IF EXISTS "Anyone can upload to courses" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to courses" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update courses files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update courses files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete from courses" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete from courses" ON storage.objects;

-- Ensure public read policy exists for 'courses' bucket
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Public read access for courses'
  ) THEN
    CREATE POLICY "Public read access for courses" 
      ON storage.objects 
      FOR SELECT 
      USING (bucket_id = 'courses');
  END IF;
END $$;

-- NOTE: No INSERT, UPDATE, or DELETE policies for clients
-- All writes to 'courses' bucket must be done via Edge Functions using service role