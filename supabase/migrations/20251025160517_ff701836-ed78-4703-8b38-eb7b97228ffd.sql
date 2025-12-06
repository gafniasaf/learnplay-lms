-- Step 4: Create user_roles table (simplified primary key)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'org_admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add unique constraint to prevent duplicate user-org-role combinations
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique 
  ON user_roles(user_id, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), role);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON user_roles(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_superadmin ON user_roles(user_id) WHERE organization_id IS NULL AND role = 'superadmin';