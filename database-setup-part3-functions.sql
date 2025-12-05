-- ============================================
-- LEARNPLAY PLATFORM - DATABASE SETUP PART 3
-- HELPER FUNCTIONS AND UTILITIES
-- ============================================

-- ============================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================

-- Check if user is a superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id IS NULL
      AND role = 'superadmin'
  );
$$;

-- Check if user is a superadmin (using auth.uid)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id IS NULL
      AND role = 'superadmin'
  );
$$;

-- Check if user is in organization
CREATE OR REPLACE FUNCTION public.user_in_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND org_id = _org_id
  );
$$;

-- Check if user is in organization (using auth.uid)
CREATE OR REPLACE FUNCTION public.user_in_org(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
      AND org_id = org_id
  );
$$;

-- Check if user is org member
CREATE OR REPLACE FUNCTION public.user_is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND org_id = _org_id
  );
$$;

-- Check if user is org admin
CREATE OR REPLACE FUNCTION public.user_is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND org_id = _org_id
      AND org_role = 'school_admin'
  );
$$;

-- Check if user has specific org role(s)
CREATE OR REPLACE FUNCTION public.user_has_org_role(_user_id uuid, _org_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND org_id = _org_id
      AND org_role = ANY(_roles)
  )
$$;

-- Check if user can access assignment
CREATE OR REPLACE FUNCTION public.user_can_access_assignment(_user_id uuid, _assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Check if user is teacher/admin in the org
  SELECT EXISTS (
    SELECT 1
    FROM assignments a
    JOIN organization_users ou ON ou.org_id = a.org_id
    WHERE a.id = _assignment_id
      AND ou.user_id = _user_id
      AND ou.org_role = ANY(ARRAY['school_admin'::text, 'teacher'::text])
  )
  OR
  -- Check if user is assigned directly
  EXISTS (
    SELECT 1
    FROM assignment_assignees aa
    WHERE aa.assignment_id = _assignment_id
      AND aa.assignee_type = 'student'
      AND aa.user_id = _user_id
  )
  OR
  -- Check if user is in an assigned class
  EXISTS (
    SELECT 1
    FROM assignment_assignees aa
    JOIN class_members cm ON cm.class_id = aa.class_id
    WHERE aa.assignment_id = _assignment_id
      AND aa.assignee_type = 'class'
      AND cm.user_id = _user_id
      AND cm.role = 'student'
  )
$$;

-- ============================================
-- UTILITY FUNCTIONS
-- ============================================

-- Generate unique child code
CREATE OR REPLACE FUNCTION public.generate_child_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM child_codes WHERE child_codes.code = code AND used = false) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN code;
END;
$$;

-- Generate unique class join code
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    SELECT EXISTS(
      SELECT 1 
      FROM class_join_codes 
      WHERE code = new_code 
        AND is_active = true 
        AND expires_at > now()
    ) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- Join class with code (stored procedure)
CREATE OR REPLACE FUNCTION public.join_class_with_code(p_user_id uuid, p_code text)
RETURNS TABLE(class_id uuid, class_name text, org_id uuid, already_member boolean)
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired join code';
  END IF;

  v_class_id := v_join_code.class_id;
  v_class_name := v_join_code.name;
  v_org_id := v_join_code.org_id;

  SELECT EXISTS(
    SELECT 1
    FROM class_members
    WHERE class_id = v_class_id
      AND user_id = p_user_id
  ) INTO v_existing_member;

  IF v_existing_member THEN
    RETURN QUERY SELECT v_class_id, v_class_name, v_org_id, true;
    RETURN;
  END IF;

  INSERT INTO organization_users (org_id, user_id, org_role)
  VALUES (v_org_id, p_user_id, 'student')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  INSERT INTO class_members (class_id, user_id, role)
  VALUES (v_class_id, p_user_id, 'student');

  RETURN QUERY SELECT v_class_id, v_class_name, v_org_id, false;
END;
$$;

-- AI job rate limiting
CREATE OR REPLACE FUNCTION public.check_ai_job_rate_limit(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  job_count integer;
begin
  select count(*)
  into job_count
  from public.ai_course_jobs
  where created_by = user_id
    and created_at > now() - interval '1 hour';
  return job_count < 10;
end;
$$;

-- Get next pending course generation job
CREATE OR REPLACE FUNCTION public.get_next_pending_job()
RETURNS TABLE(id uuid, course_id text, subject text, grade_band text, grade text, items_per_group integer, mode text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_row public.ai_course_jobs;
BEGIN
  SELECT *
  INTO job_row
  FROM public.ai_course_jobs
  WHERE (public.ai_course_jobs.status = 'pending')
     OR (public.ai_course_jobs.status = 'failed' AND public.ai_course_jobs.retry_count < public.ai_course_jobs.max_retries)
  ORDER BY public.ai_course_jobs.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF job_row.id IS NOT NULL THEN
    IF job_row.status = 'failed' THEN
      UPDATE public.ai_course_jobs
      SET status = 'processing',
          started_at = now(),
          retry_count = retry_count + 1,
          last_heartbeat = now()
      WHERE public.ai_course_jobs.id = job_row.id;
    ELSE
      UPDATE public.ai_course_jobs
      SET status = 'processing',
          started_at = now(),
          last_heartbeat = now()
      WHERE public.ai_course_jobs.id = job_row.id;
    END IF;
    
    RETURN QUERY
    SELECT job_row.id, job_row.course_id, job_row.subject, job_row.grade_band, 
           job_row.grade, job_row.items_per_group, job_row.mode;
  END IF;
END;
$$;

-- Continue with more functions in next file...
