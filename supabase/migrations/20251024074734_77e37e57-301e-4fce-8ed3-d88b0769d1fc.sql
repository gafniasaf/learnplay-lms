-- Enable pg_net extension for HTTP requests from database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create trigger to automatically process ai_course_jobs
DROP TRIGGER IF EXISTS on_job_change_trigger_runner ON public.ai_course_jobs;
CREATE TRIGGER on_job_change_trigger_runner
  AFTER INSERT OR UPDATE ON public.ai_course_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ai_job_runner();

-- Create trigger to automatically process ai_media_jobs
DROP TRIGGER IF EXISTS on_media_job_change_trigger_runner ON public.ai_media_jobs;
CREATE TRIGGER on_media_job_change_trigger_runner
  AFTER INSERT OR UPDATE ON public.ai_media_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_ai_job_runner();