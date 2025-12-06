CREATE OR REPLACE FUNCTION list_triggers_debug()
RETURNS TABLE (trigger_name text, event_object_table text) 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
  RETURN QUERY 
  SELECT cast(tgname as text), cast(relname as text)
  FROM pg_trigger
  JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
  WHERE relname IN ('ai_course_jobs', 'ai_media_jobs');
END;
$$;

