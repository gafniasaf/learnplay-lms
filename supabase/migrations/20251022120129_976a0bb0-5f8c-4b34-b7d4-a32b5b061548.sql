-- Create AI course jobs table
CREATE TABLE public.ai_course_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade_band TEXT NOT NULL,
  grade TEXT,
  items_per_group INTEGER NOT NULL DEFAULT 12,
  mode TEXT NOT NULL CHECK (mode IN ('options', 'numeric')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  result_path TEXT,
  error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.ai_course_jobs ENABLE ROW LEVEL SECURITY;

-- Teachers/admins can view jobs in their org
CREATE POLICY "teachers view org jobs"
ON public.ai_course_jobs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Teachers/admins can create jobs
CREATE POLICY "teachers create jobs"
ON public.ai_course_jobs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
  AND created_by = auth.uid()
);

-- Create index for efficient job queue processing
CREATE INDEX idx_ai_jobs_pending ON public.ai_course_jobs (created_at) WHERE status = 'pending';
CREATE INDEX idx_ai_jobs_status ON public.ai_course_jobs (status, created_at);