-- Create 'courses' storage bucket (public for read access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('courses', 'courses', true);

-- Allow anonymous users to read course files
CREATE POLICY "Public read courses"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'courses');