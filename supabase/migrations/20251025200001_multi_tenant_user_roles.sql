-- Multi-Tenant User Roles
-- Part 2: Per-Organization RBAC

-- ============================================================================
-- Tables
-- ============================================================================

-- User roles table (per-org RBAC)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = superadmin
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'org_admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_org ON user_roles(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_user_roles_superadmin ON user_roles(user_id) WHERE organization_id IS NULL AND role = 'superadmin';

COMMENT ON TABLE user_roles IS 'Per-organization user roles with superadmin support';
COMMENT ON COLUMN user_roles.organization_id IS 'NULL for superadmin (global access)';
COMMENT ON COLUMN user_roles.role IS 'superadmin (global) | org_admin | editor | viewer';

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Superadmins can manage all roles
CREATE POLICY "Superadmins can manage all user_roles"
  ON user_roles FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Org admins can manage roles in their org
CREATE POLICY "Org admins can manage org user_roles"
  ON user_roles FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
  );

-- Users can read their own roles
CREATE POLICY "Users can read their own roles"
  ON user_roles FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get user role in specific org
CREATE OR REPLACE FUNCTION get_user_role_in_org(org_id UUID)
RETURNS TEXT AS $$
  SELECT role
  FROM user_roles
  WHERE user_id = auth.uid()
    AND organization_id = org_id
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_role_in_org(UUID) IS 'Get user role in specific organization';

-- Check if user has any role in org
CREATE OR REPLACE FUNCTION user_in_org(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = org_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION user_in_org(UUID) IS 'Check if user has any role in organization';

-- Get all roles for current user (including superadmin)
CREATE OR REPLACE FUNCTION get_user_roles()
RETURNS TABLE (org_id UUID, role_name TEXT) AS $$
  SELECT organization_id, role
  FROM user_roles
  WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_roles() IS 'Get all roles for current user across all orgs';

