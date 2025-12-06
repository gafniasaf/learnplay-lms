-- Force add updated_at column
ALTER TABLE public.ai_course_jobs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.ai_media_jobs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Drop ANY trigger that might rely on it
DROP TRIGGER IF EXISTS handle_updated_at ON public.ai_course_jobs;
DROP TRIGGER IF EXISTS set_updated_at ON public.ai_course_jobs;

