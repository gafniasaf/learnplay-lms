-- Add org_id to media tables (without RLS policies that need functions)
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE content_embeddings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE media_assets SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE content_embeddings SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_org ON media_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_org ON content_embeddings(organization_id);