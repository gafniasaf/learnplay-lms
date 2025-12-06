-- Create organization_domains and add trigger
CREATE TABLE IF NOT EXISTS organization_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT UNIQUE NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_domains_org ON organization_domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_domains_domain ON organization_domains(domain);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_domains_primary 
  ON organization_domains(organization_id) 
  WHERE is_primary = true;

-- Recreate update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add trigger
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed default domain
INSERT INTO organization_domains (organization_id, domain, is_primary, verified_at)
SELECT id, 'learnplay.com', true, now()
FROM organizations
WHERE slug = 'learnplay'
ON CONFLICT (domain) DO NOTHING;