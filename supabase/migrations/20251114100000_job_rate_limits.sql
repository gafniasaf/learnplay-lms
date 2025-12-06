-- Migration: Job creation rate limits
-- Prevents users from creating too many jobs in a short time

-- Create a function to check rate limits before job creation
CREATE OR REPLACE FUNCTION check_job_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_id UUID;
  jobs_in_last_hour INT;
  jobs_in_last_day INT;
  hourly_limit INT := 10; -- Max 10 jobs per hour
  daily_limit INT := 50;  -- Max 50 jobs per day
BEGIN
  user_id := auth.uid();
  
  -- Skip rate limit for service role
  IF current_setting('role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- Skip rate limit in test mode
  IF current_setting('app.test_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;
  
  -- Check hourly rate limit
  SELECT COUNT(*) INTO jobs_in_last_hour
  FROM ai_course_jobs
  WHERE created_by = user_id
    AND created_at > NOW() - INTERVAL '1 hour';
  
  IF jobs_in_last_hour >= hourly_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % jobs per hour', hourly_limit
      USING HINT = 'Please wait before creating more jobs';
  END IF;
  
  -- Check daily rate limit
  SELECT COUNT(*) INTO jobs_in_last_day
  FROM ai_course_jobs
  WHERE created_by = user_id
    AND created_at > NOW() - INTERVAL '1 day';
  
  IF jobs_in_last_day >= daily_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum % jobs per day', daily_limit
      USING HINT = 'Daily quota reached, try again tomorrow';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for rate limiting
DROP TRIGGER IF EXISTS enforce_job_rate_limit ON ai_course_jobs;
CREATE TRIGGER enforce_job_rate_limit
  BEFORE INSERT ON ai_course_jobs
  FOR EACH ROW
  EXECUTE FUNCTION check_job_rate_limit();

-- Create index for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_ai_course_jobs_rate_limit 
  ON ai_course_jobs(created_by, created_at DESC);

-- Create a view for users to check their current usage
CREATE OR REPLACE VIEW user_job_quota AS
SELECT
  auth.uid() as user_id,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as jobs_last_hour,
  10 as hourly_limit,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as jobs_last_day,
  50 as daily_limit
FROM ai_course_jobs
WHERE created_by = auth.uid()
GROUP BY auth.uid();

-- Grant access to the quota view
GRANT SELECT ON user_job_quota TO authenticated;

COMMENT ON VIEW user_job_quota IS 'Shows current job creation quota usage for the authenticated user';
COMMENT ON FUNCTION check_job_rate_limit() IS 'Enforces rate limits on job creation (10/hour, 50/day)';
