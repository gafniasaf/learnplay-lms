-- Add organization_id to ai_agent_jobs for multi-tenant filtering
-- This is a fix for the list-jobs function which requires this column

-- Add the column if it doesn't exist
ALTER TABLE public.ai_agent_jobs 
ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_ai_agent_jobs_organization_id 
ON public.ai_agent_jobs(organization_id);

-- Add same column to ai_course_jobs if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_course_jobs' AND table_schema = 'public') THEN
    ALTER TABLE public.ai_course_jobs 
    ADD COLUMN IF NOT EXISTS organization_id UUID;
    
    CREATE INDEX IF NOT EXISTS idx_ai_course_jobs_organization_id 
    ON public.ai_course_jobs(organization_id);
  END IF;
END $$;

COMMENT ON COLUMN public.ai_agent_jobs.organization_id IS 'Organization this job belongs to for multi-tenant filtering';


