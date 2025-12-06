-- Create RPC function for atomic class joining
CREATE OR REPLACE FUNCTION public.join_class_with_code(
  p_user_id uuid,
  p_code text
)
RETURNS TABLE (
  class_id uuid,
  class_name text,
  org_id uuid,
  already_member boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_join_code RECORD;
  v_org_id uuid;
  v_class_id uuid;
  v_class_name text;
  v_existing_member boolean;
BEGIN
  -- Validate and fetch join code
  SELECT 
    jc.class_id,
    c.name,
    c.org_id
  INTO v_join_code
  FROM class_join_codes jc
  JOIN classes c ON c.id = jc.class_id
  WHERE jc.code = UPPER(p_code)
    AND jc.is_active = true
    AND jc.expires_at > now();

  -- If code not found or invalid
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired join code';
  END IF;

  v_class_id := v_join_code.class_id;
  v_class_name := v_join_code.name;
  v_org_id := v_join_code.org_id;

  -- Check if already a class member
  SELECT EXISTS(
    SELECT 1
    FROM class_members
    WHERE class_id = v_class_id
      AND user_id = p_user_id
  ) INTO v_existing_member;

  -- If already a member, return early
  IF v_existing_member THEN
    RETURN QUERY SELECT v_class_id, v_class_name, v_org_id, true;
    RETURN;
  END IF;

  -- Add user to organization (UPSERT - no error if already exists)
  INSERT INTO organization_users (org_id, user_id, org_role)
  VALUES (v_org_id, p_user_id, 'student')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  -- Add user to class
  INSERT INTO class_members (class_id, user_id, role)
  VALUES (v_class_id, p_user_id, 'student');

  -- Return success
  RETURN QUERY SELECT v_class_id, v_class_name, v_org_id, false;
END;
$$;