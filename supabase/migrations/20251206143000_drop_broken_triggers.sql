-- Drop the trigger that requires updated_at column
DROP TRIGGER IF EXISTS handle_updated_at ON ai_course_jobs;
DROP TRIGGER IF EXISTS handle_updated_at ON ai_media_jobs;

-- Also try other common names just in case
DROP TRIGGER IF EXISTS set_updated_at ON ai_course_jobs;
DROP TRIGGER IF EXISTS set_updated_at ON ai_media_jobs;
DROP TRIGGER IF EXISTS update_ai_course_jobs_modtime ON ai_course_jobs;

