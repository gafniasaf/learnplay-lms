-- Add progress tracking fields to ai_course_jobs
ALTER TABLE ai_course_jobs 
ADD COLUMN IF NOT EXISTS progress_stage text DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS progress_percent integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_message text;

-- Enable realtime for ai_course_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE ai_course_jobs;
ALTER TABLE ai_course_jobs REPLICA IDENTITY FULL;