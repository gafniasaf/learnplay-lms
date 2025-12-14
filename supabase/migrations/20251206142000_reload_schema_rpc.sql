CREATE OR REPLACE FUNCTION reload_schema() 
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
  NOTIFY pgrst, 'reload schema';
END;
$$;


