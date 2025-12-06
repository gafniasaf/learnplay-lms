-- Drop existing problematic policies
DROP POLICY IF EXISTS "student read assignments" ON public.assignments;
DROP POLICY IF EXISTS "teacher manage assignments" ON public.assignments;
DROP POLICY IF EXISTS "student read assignees" ON public.assignment_assignees;
DROP POLICY IF EXISTS "teacher manage assignees" ON public.assignment_assignees;

-- Create security definer function to check assignment access without recursion
CREATE OR REPLACE FUNCTION public.user_can_access_assignment(_user_id uuid, _assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- Recreate assignments policies using the helper function
CREATE POLICY "users can read their assignments"
ON public.assignments
FOR SELECT
TO authenticated
USING (public.user_can_access_assignment(auth.uid(), id));

CREATE POLICY "teachers manage org assignments"
ON public.assignments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.org_id = assignments.org_id
      AND ou.user_id = auth.uid()
      AND ou.org_role = ANY(ARRAY['school_admin'::text, 'teacher'::text])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM organization_users ou
    WHERE ou.org_id = assignments.org_id
      AND ou.user_id = auth.uid()
      AND ou.org_role = ANY(ARRAY['school_admin'::text, 'teacher'::text])
  )
);

-- Recreate assignment_assignees policies
CREATE POLICY "users can read assignees for their assignments"
ON public.assignment_assignees
FOR SELECT
TO authenticated
USING (public.user_can_access_assignment(auth.uid(), assignment_id));

CREATE POLICY "teachers manage assignees"
ON public.assignment_assignees
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM assignments a
    JOIN organization_users ou ON ou.org_id = a.org_id
    WHERE a.id = assignment_assignees.assignment_id
      AND ou.user_id = auth.uid()
      AND ou.org_role = ANY(ARRAY['school_admin'::text, 'teacher'::text])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM assignments a
    JOIN organization_users ou ON ou.org_id = a.org_id
    WHERE a.id = assignment_assignees.assignment_id
      AND ou.user_id = auth.uid()
      AND ou.org_role = ANY(ARRAY['school_admin'::text, 'teacher'::text])
  )
);