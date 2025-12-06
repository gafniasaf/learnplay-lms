-- Enable RLS (already enabled but keeping for completeness)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "org admins read org" ON public.organizations;
DROP POLICY IF EXISTS "org admins read all org users" ON public.organization_users;

-- Organizations: Any member can read their org
CREATE POLICY "org_read_for_members" 
ON public.organizations 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.organization_users ou 
    WHERE ou.org_id = organizations.id 
      AND ou.user_id = auth.uid()
  )
);

-- Organization users: Members can read all users in their orgs
CREATE POLICY "org_users_read_for_members" 
ON public.organization_users 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM public.organization_users ou 
    WHERE ou.org_id = organization_users.org_id 
      AND ou.user_id = auth.uid()
  )
);

-- Organization users: Admins can add members
CREATE POLICY "org_users_admin_insert" 
ON public.organization_users 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.organization_users ou 
    WHERE ou.org_id = organization_users.org_id 
      AND ou.user_id = auth.uid() 
      AND ou.org_role = 'school_admin'
  )
);

-- Organization users: Admins can remove members
CREATE POLICY "org_users_admin_delete" 
ON public.organization_users 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 
    FROM public.organization_users ou 
    WHERE ou.org_id = organization_users.org_id 
      AND ou.user_id = auth.uid() 
      AND ou.org_role = 'school_admin'
  )
);