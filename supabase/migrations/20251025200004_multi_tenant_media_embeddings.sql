-- Multi-Tenant Media Assets and Content Embeddings
-- Part 5: Add organization_id to existing tables

-- ============================================================================
-- Alter Existing Tables
-- ============================================================================

-- Add organization_id to media_assets (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_assets' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE media_assets 
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    
    -- Set default org for existing media
    UPDATE media_assets
    SET organization_id = '00000000-0000-0000-0000-000000000001'
    WHERE organization_id IS NULL;
    
    -- Make NOT NULL after backfill
    ALTER TABLE media_assets 
    ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_media_assets_org ON media_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_org_type ON media_assets(organization_id, mime_type);

COMMENT ON COLUMN media_assets.organization_id IS 'Owner organization (scoped by RLS)';

-- Add organization_id to content_embeddings (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_embeddings' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE content_embeddings 
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    
    -- Set default org for existing embeddings
    UPDATE content_embeddings
    SET organization_id = '00000000-0000-0000-0000-000000000001'
    WHERE organization_id IS NULL;
    
    -- Make NOT NULL after backfill
    ALTER TABLE content_embeddings 
    ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_embeddings_org ON content_embeddings(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_org_course ON content_embeddings(organization_id, course_id);

COMMENT ON COLUMN content_embeddings.organization_id IS 'Owner organization (scoped by RLS)';

-- ============================================================================
-- Update RLS Policies
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can read all media_assets" ON media_assets;
DROP POLICY IF EXISTS "Admins can insert media_assets" ON media_assets;
DROP POLICY IF EXISTS "Admins can read all content_embeddings" ON content_embeddings;

-- Media Assets: Superadmin full access
CREATE POLICY "Superadmins can manage all media_assets"
  ON media_assets FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Media Assets: Org users can read their org's media + global media
CREATE POLICY "Org users can read org and global media"
  ON media_assets FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    OR EXISTS (
      SELECT 1 FROM course_metadata
      WHERE id IN (
        SELECT DISTINCT substring(path FROM 'courses/([^/]+)') 
        FROM media_assets ma 
        WHERE ma.id = media_assets.id
      )
      AND visibility = 'global'
    )
  );

-- Media Assets: Editors can insert/update/delete own org's media
CREATE POLICY "Editors can manage org media"
  ON media_assets FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('org_admin', 'editor')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('org_admin', 'editor')
    )
  );

-- Content Embeddings: Superadmin full access
CREATE POLICY "Superadmins can manage all content_embeddings"
  ON content_embeddings FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Content Embeddings: Org users can read their org's embeddings
CREATE POLICY "Org users can read org content_embeddings"
  ON content_embeddings FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    OR course_id IN (
      SELECT id FROM course_metadata WHERE visibility = 'global'
    )
  );

-- Content Embeddings: System can insert/update (for async jobs)
CREATE POLICY "Editors can manage org content_embeddings"
  ON content_embeddings FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('org_admin', 'editor')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('org_admin', 'editor')
    )
  );

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Search media by organization (respecting RLS)
CREATE OR REPLACE FUNCTION search_media_by_org(
  p_organization_id UUID,
  p_query TEXT DEFAULT NULL,
  p_mime_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  bucket TEXT,
  path TEXT,
  mime_type TEXT,
  width INT,
  height INT,
  alt_text TEXT,
  tags TEXT[],
  uploaded_by UUID,
  created_at TIMESTAMPTZ,
  similarity FLOAT
) AS $$
BEGIN
  -- If pgvector search is available and query provided
  IF p_query IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    -- Semantic search
    RETURN QUERY
    SELECT
      ma.id,
      ma.bucket,
      ma.path,
      ma.mime_type,
      ma.width,
      ma.height,
      ma.alt_text,
      ma.tags,
      ma.uploaded_by,
      ma.created_at,
      1 - (ma.embedding <=> ai_embedding(p_query)) AS similarity
    FROM media_assets ma
    WHERE ma.organization_id = p_organization_id
      AND (p_mime_type IS NULL OR ma.mime_type LIKE p_mime_type)
    ORDER BY ma.embedding <=> ai_embedding(p_query)
    LIMIT p_limit OFFSET p_offset;
  ELSE
    -- Fallback: text search
    RETURN QUERY
    SELECT
      ma.id,
      ma.bucket,
      ma.path,
      ma.mime_type,
      ma.width,
      ma.height,
      ma.alt_text,
      ma.tags,
      ma.uploaded_by,
      ma.created_at,
      NULL::FLOAT AS similarity
    FROM media_assets ma
    WHERE ma.organization_id = p_organization_id
      AND (p_mime_type IS NULL OR ma.mime_type LIKE p_mime_type)
      AND (
        p_query IS NULL 
        OR ma.alt_text ILIKE '%' || p_query || '%'
        OR ma.path ILIKE '%' || p_query || '%'
      )
    ORDER BY ma.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION search_media_by_org(UUID, TEXT, TEXT, INT, INT) IS 'Search media with semantic or text fallback';

-- Stub for AI embedding (to be implemented by edge function)
CREATE OR REPLACE FUNCTION ai_embedding(text_content TEXT)
RETURNS vector AS $$
  -- Placeholder: actual embedding generated by edge function
  -- This is just for function signature
  SELECT NULL::vector;
$$ LANGUAGE SQL IMMUTABLE;

-- Search content embeddings by organization
CREATE OR REPLACE FUNCTION search_content_by_org(
  p_organization_id UUID,
  p_query TEXT,
  p_content_types TEXT[] DEFAULT ARRAY['stem', 'option', 'reference'],
  p_course_id TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  course_id TEXT,
  group_index INT,
  item_index INT,
  content_type TEXT,
  option_id TEXT,
  text_content TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.course_id,
    ce.group_index,
    ce.item_index,
    ce.content_type,
    ce.option_id,
    ce.text_content,
    1 - (ce.embedding <=> ai_embedding(p_query)) AS similarity
  FROM content_embeddings ce
  WHERE ce.organization_id = p_organization_id
    AND (p_course_id IS NULL OR ce.course_id = p_course_id)
    AND ce.content_type = ANY(p_content_types)
  ORDER BY ce.embedding <=> ai_embedding(p_query)
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION search_content_by_org(UUID, TEXT, TEXT[], TEXT, INT) IS 'Semantic search over course content';

