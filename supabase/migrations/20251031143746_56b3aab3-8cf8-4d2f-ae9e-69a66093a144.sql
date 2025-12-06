-- Drop the problematic policies
DROP POLICY IF EXISTS "org_users_read_for_members" ON public.organization_users;
DROP POLICY IF EXISTS "org_users_admin_delete" ON public.organization_users;
DROP POLICY IF EXISTS "org_users_admin_insert" ON public.organization_users;

-- Create security definer function to check org membership (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND org_id = _org_id
  );
$$;

-- Create security definer function to check if user is org admin
CREATE OR REPLACE FUNCTION public.user_is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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

-- Recreate policies using security definer functions (no recursion)
CREATE POLICY "org_users_read_for_members"
ON public.organization_users
FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), org_id));

CREATE POLICY "org_users_admin_delete"
ON public.organization_users
FOR DELETE
TO authenticated
USING (public.user_is_org_admin(auth.uid(), org_id));

CREATE POLICY "org_users_admin_insert"
ON public.organization_users
FOR INSERT
TO authenticated
WITH CHECK (public.user_is_org_admin(auth.uid(), org_id));