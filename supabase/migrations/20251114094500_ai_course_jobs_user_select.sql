-- Allow users to view their own jobs in addition to admins
DROP POLICY IF EXISTS "teachers view org jobs" ON public.ai_course_jobs;
DROP POLICY IF EXISTS "users view own jobs" ON public.ai_course_jobs;

CREATE POLICY "users view own or admin jobs"
ON public.ai_course_jobs
FOR SELECT
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
