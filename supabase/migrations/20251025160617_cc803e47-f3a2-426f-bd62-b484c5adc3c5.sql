-- Keep only the oldest organization, delete rest
DELETE FROM organizations 
WHERE id NOT IN (
  SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1
);

-- Update the remaining one
UPDATE organizations 
SET slug = 'learnplay',
    branding = '{"logoUrl": "/placeholder.svg", "primaryColor": "#1E40AF", "secondaryColor": "#F59E0B", "typography": {"fontFamily": "Inter, system-ui, sans-serif"}}'::jsonb,
    settings = '{"tagTypes": {"enabled": ["domain", "level", "theme", "subject"], "order": ["domain", "level", "subject", "theme"], "labels": {"domain": "Domain", "level": "Level", "subject": "Subject", "theme": "Theme"}}, "catalog": {"cards": {"showBadges": true, "showOwner": false}}, "variants": {"difficulty": {"exposeToUsers": true, "defaultLevelId": "intermediate", "labels": {"beginner": "Beginner", "intermediate": "Intermediate", "advanced": "Advanced", "expert": "Expert"}}}}'::jsonb,
    name = 'LearnPlay';

-- Add constraints
ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL;
ALTER TABLE organizations ADD CONSTRAINT organizations_slug_key UNIQUE (slug);

-- Add seed domain
INSERT INTO organization_domains (organization_id, domain, is_primary, verified_at)
SELECT id, 'learnplay.com', true, now()
FROM organizations
LIMIT 1
ON CONFLICT (domain) DO NOTHING;