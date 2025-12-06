-- Step 5: Create helper functions
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id IS NULL
      AND role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = public
AS $$
  SELECT organization_id
  FROM user_roles
  WHERE user_id = auth.uid()
    AND organization_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION has_org_role(org_id UUID, required_role TEXT)
RETURNS BOOLEAN 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role = required_role
  );
$$;

CREATE OR REPLACE FUNCTION get_user_role_in_org(org_id UUID)
RETURNS TEXT 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM user_roles
  WHERE user_id = auth.uid()
    AND organization_id = org_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION user_in_org(org_id UUID)
RETURNS BOOLEAN 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = org_id
  );
$$;

CREATE OR REPLACE FUNCTION get_user_roles()
RETURNS TABLE (org_id UUID, role_name TEXT) 
LANGUAGE SQL 
SECURITY DEFINER 
STABLE
SET search_path = public
AS $$
  SELECT organization_id, role
  FROM user_roles
  WHERE user_id = auth.uid();
$$;