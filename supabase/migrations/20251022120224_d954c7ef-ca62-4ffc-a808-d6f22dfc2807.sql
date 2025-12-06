-- Create RPC function to get next pending job with lock
CREATE OR REPLACE FUNCTION public.get_next_pending_job()
RETURNS TABLE (
  id UUID,
  course_id TEXT,
  subject TEXT,
  grade_band TEXT,
  grade TEXT,
  items_per_group INTEGER,
  mode TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.course_id,
    j.subject,
    j.grade_band,
    j.grade,
    j.items_per_group,
    j.mode
  FROM public.ai_course_jobs j
  WHERE j.status = 'pending'
  ORDER BY j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
END;
$$;