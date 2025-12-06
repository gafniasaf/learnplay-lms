-- Multi-Tenant Organizations
-- Part 1: Organizations and Domains

-- ============================================================================
-- Tables
-- ============================================================================

-- Organizations table (white-label tenants)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,              -- subdomain or path slug
  branding JSONB DEFAULT '{}'::jsonb,     -- { logoUrl, primaryColor, secondaryColor, typography }
  settings JSONB DEFAULT '{}'::jsonb,     -- per-org configuration
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_created ON organizations(created_at DESC);

COMMENT ON TABLE organizations IS 'White-label organizations/institutions';
COMMENT ON COLUMN organizations.slug IS 'URL-safe identifier for subdomain or path';
COMMENT ON COLUMN organizations.branding IS 'Logo, colors, typography settings';
COMMENT ON COLUMN organizations.settings IS 'Org-specific config: tags, catalog, variants, SSO';

-- Organization domains (custom domains)
CREATE TABLE IF NOT EXISTS organization_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT UNIQUE NOT NULL,            -- e.g., 'school-a.learnplay.com' or 'learn.schoola.edu'
  is_primary BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_organization_domains_org ON organization_domains(organization_id);
CREATE INDEX idx_organization_domains_domain ON organization_domains(domain);
CREATE UNIQUE INDEX idx_organization_domains_primary 
  ON organization_domains(organization_id) 
  WHERE is_primary = true;

COMMENT ON TABLE organization_domains IS 'Custom domains per organization';
COMMENT ON COLUMN organization_domains.is_primary IS 'Only one primary domain allowed per org';
COMMENT ON COLUMN organization_domains.verified_at IS 'Domain ownership verification timestamp';

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Check if current user is superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id IS NULL
      AND role = 'superadmin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_superadmin() IS 'Returns true if current user has superadmin role';

-- Get user organization IDs
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id
  FROM user_roles
  WHERE user_id = auth.uid()
    AND organization_id IS NOT NULL;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_org_ids() IS 'Returns all organization IDs for current user';

-- Check if user has role in org
CREATE OR REPLACE FUNCTION has_org_role(org_id UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role = required_role
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION has_org_role(UUID, TEXT) IS 'Check if user has specific role in organization';

-- RLS helper function to check table RLS status
CREATE OR REPLACE FUNCTION check_rls_enabled(table_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE relname = table_name;
  
  RETURN COALESCE(rls_enabled, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_rls_enabled(TEXT) IS 'Check if RLS is enabled on a table';

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_domains ENABLE ROW LEVEL SECURITY;

-- Organizations: Superadmin full access
CREATE POLICY "Superadmins can manage all organizations"
  ON organizations FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Organizations: Users can read their organization
CREATE POLICY "Users can read their organization"
  ON organizations FOR SELECT
  USING (
    id IN (SELECT get_user_org_ids())
  );

-- Organizations: Org admins can update their organization
CREATE POLICY "Org admins can update their organization"
  ON organizations FOR UPDATE
  USING (
    has_org_role(id, 'org_admin')
  )
  WITH CHECK (
    has_org_role(id, 'org_admin')
  );

-- Organization Domains: Superadmin full access
CREATE POLICY "Superadmins can manage all domains"
  ON organization_domains FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Organization Domains: Org users can read their domains
CREATE POLICY "Org users can read their domains"
  ON organization_domains FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
  );

-- Organization Domains: Org admins can manage their domains
CREATE POLICY "Org admins can manage their domains"
  ON organization_domains FOR ALL
  USING (
    has_org_role(organization_id, 'org_admin')
  )
  WITH CHECK (
    has_org_role(organization_id, 'org_admin')
  );

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed Data
-- ============================================================================

-- Create default organization for existing courses
INSERT INTO organizations (id, name, slug, branding, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'LearnPlay',
  'learnplay',
  '{
    "logoUrl": "/placeholder.svg",
    "primaryColor": "#1E40AF",
    "secondaryColor": "#F59E0B",
    "typography": {
      "fontFamily": "Inter, system-ui, sans-serif"
    }
  }'::jsonb,
  '{
    "tagTypes": {
      "enabled": ["domain", "level", "theme", "subject"],
      "order": ["domain", "level", "subject", "theme"],
      "labels": {
        "domain": "Domain",
        "level": "Level",
        "subject": "Subject",
        "theme": "Theme"
      }
    },
    "catalog": {
      "cards": { "showBadges": true, "showOwner": false }
    },
    "variants": {
      "difficulty": {
        "exposeToUsers": true,
        "defaultLevelId": "intermediate",
        "labels": {
          "beginner": "Beginner",
          "intermediate": "Intermediate",
          "advanced": "Advanced",
          "expert": "Expert"
        }
      }
    }
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Add primary domain for default org
INSERT INTO organization_domains (organization_id, domain, is_primary, verified_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'learnplay.com',
  true,
  now()
)
ON CONFLICT (domain) DO NOTHING;

