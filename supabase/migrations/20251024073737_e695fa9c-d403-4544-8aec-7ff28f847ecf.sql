-- Add delete policy for admins on ai_course_jobs
CREATE POLICY "admins delete jobs"
ON public.ai_course_jobs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Add delete policy for admins on ai_media_jobs (for consistency)
CREATE POLICY "admins delete media jobs"
ON public.ai_media_jobs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);