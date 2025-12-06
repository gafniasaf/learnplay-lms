-- Migration: Media job creation rate limits
-- Prevents users from creating too many media (image) jobs in a short time

CREATE OR REPLACE FUNCTION check_media_job_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_id UUID;
  jobs_in_last_hour INT;
  jobs_in_last_day INT;
  hourly_limit INT := 20; -- Media can be a bit higher due to thumbnails, etc.
  daily_limit INT := 200;
BEGIN
  user_id := auth.uid();

  -- Skip rate limit for service role
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Skip rate limit in test mode
  IF current_setting('app.test_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Check hourly rate limit
  SELECT COUNT(*) INTO jobs_in_last_hour
  FROM ai_media_jobs
  WHERE created_by = user_id
    AND created_at > NOW() - INTERVAL '1 hour';

  IF jobs_in_last_hour >= hourly_limit THEN
    RAISE EXCEPTION 'Media rate limit exceeded: Maximum % jobs per hour', hourly_limit
      USING HINT = 'Please wait before creating more media jobs';
  END IF;

  -- Check daily rate limit
  SELECT COUNT(*) INTO jobs_in_last_day
  FROM ai_media_jobs
  WHERE created_by = user_id
    AND created_at > NOW() - INTERVAL '1 day';

  IF jobs_in_last_day >= daily_limit THEN
    RAISE EXCEPTION 'Media rate limit exceeded: Maximum % jobs per day', daily_limit
      USING HINT = 'Daily media quota reached, try again tomorrow';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_media_job_rate_limit ON ai_media_jobs;
CREATE TRIGGER enforce_media_job_rate_limit
  BEFORE INSERT ON ai_media_jobs
  FOR EACH ROW
  EXECUTE FUNCTION check_media_job_rate_limit();

CREATE INDEX IF NOT EXISTS idx_ai_media_jobs_rate_limit 
  ON ai_media_jobs(created_by, created_at DESC);

CREATE OR REPLACE VIEW user_media_job_quota AS
SELECT
  auth.uid() as user_id,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as jobs_last_hour,
  20 as hourly_limit,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as jobs_last_day,
  200 as daily_limit
FROM ai_media_jobs
WHERE created_by = auth.uid()
GROUP BY auth.uid();

GRANT SELECT ON user_media_job_quota TO authenticated;

COMMENT ON VIEW user_media_job_quota IS 'Shows current media job creation quota usage for the authenticated user';
COMMENT ON FUNCTION check_media_job_rate_limit() IS 'Enforces rate limits on media job creation (20/hour, 200/day)';


