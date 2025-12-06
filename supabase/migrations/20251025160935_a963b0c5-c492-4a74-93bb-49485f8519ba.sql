-- Migration 5: Add organization_id to media_assets and content_embeddings
ALTER TABLE media_assets 
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE content_embeddings 
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Set default org for existing records
UPDATE media_assets 
SET organization_id = '664ce632-4f02-4ea5-91eb-b4786d8d410b' 
WHERE organization_id IS NULL;

UPDATE content_embeddings 
SET organization_id = '664ce632-4f02-4ea5-91eb-b4786d8d410b' 
WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_org ON media_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_org ON content_embeddings(organization_id);