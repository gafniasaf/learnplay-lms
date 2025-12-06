-- Multi-Tenant Curated Tags System
-- Part 3: Tag Types and Tags

-- ============================================================================
-- Tables
-- ============================================================================

-- Tag types (admin-managed tag categories)
CREATE TABLE IF NOT EXISTS tag_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = global default
  key TEXT NOT NULL,                      -- e.g., 'domain', 'level', 'theme', 'subject', 'class'
  label TEXT NOT NULL,                    -- per-org display name (rename supported)
  is_enabled BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
);

CREATE INDEX idx_tag_types_org ON tag_types(organization_id);
CREATE INDEX idx_tag_types_enabled ON tag_types(organization_id, is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_tag_types_order ON tag_types(organization_id, display_order);

COMMENT ON TABLE tag_types IS 'Admin-managed tag type definitions (curated taxonomy)';
COMMENT ON COLUMN tag_types.organization_id IS 'NULL for global defaults inherited by all orgs';
COMMENT ON COLUMN tag_types.key IS 'snake_case identifier (domain, level, theme, etc.)';
COMMENT ON COLUMN tag_types.label IS 'Human-readable label (per-org customizable)';
COMMENT ON COLUMN tag_types.is_enabled IS 'Org can hide/show tag types';
COMMENT ON COLUMN tag_types.display_order IS 'Sort order in UI filters';

-- Tags (allowed values per tag type)
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = global value
  type_key TEXT NOT NULL,                 -- FK-like to tag_types.key
  value TEXT NOT NULL,                    -- display text
  slug TEXT NOT NULL,                     -- kebab-case identifier
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), type_key, slug)
);

CREATE INDEX idx_tags_org_type ON tags(organization_id, type_key);
CREATE INDEX idx_tags_active ON tags(organization_id, type_key, is_active) WHERE is_active = true;
CREATE INDEX idx_tags_slug ON tags(type_key, slug);

COMMENT ON TABLE tags IS 'Curated tag values (controlled vocabulary)';
COMMENT ON COLUMN tags.organization_id IS 'NULL for global tags shared across all orgs';
COMMENT ON COLUMN tags.type_key IS 'Must match tag_types.key (validated via trigger)';
COMMENT ON COLUMN tags.value IS 'Human-readable display text';
COMMENT ON COLUMN tags.slug IS 'URL-safe kebab-case identifier';
COMMENT ON COLUMN tags.is_active IS 'Soft delete (hide without removing)';

-- Tag approval queue (AI suggestions awaiting admin approval)
CREATE TABLE IF NOT EXISTS tag_approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  suggested_tags JSONB NOT NULL,          -- { domain: ["AI Suggestion 1"], level: ["Grade 5"] }
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  mapped_tag_ids UUID[],                  -- Final mapped tag IDs after approval
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tag_approval_org ON tag_approval_queue(organization_id);
CREATE INDEX idx_tag_approval_course ON tag_approval_queue(course_id);
CREATE INDEX idx_tag_approval_status ON tag_approval_queue(organization_id, status) WHERE status = 'pending';

COMMENT ON TABLE tag_approval_queue IS 'AI-suggested tags awaiting admin review and mapping';
COMMENT ON COLUMN tag_approval_queue.suggested_tags IS 'Freeform tags from AI';
COMMENT ON COLUMN tag_approval_queue.mapped_tag_ids IS 'Curated tag IDs after admin maps suggestions';

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Enable RLS
ALTER TABLE tag_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_approval_queue ENABLE ROW LEVEL SECURITY;

-- Tag Types: Superadmin full access
CREATE POLICY "Superadmins can manage all tag_types"
  ON tag_types FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Tag Types: Org users can read their org's + global tag types
CREATE POLICY "Org users can read tag_types"
  ON tag_types FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    OR organization_id IS NULL  -- Global defaults
  );

-- Tag Types: Org admins can manage their org's tag types
CREATE POLICY "Org admins can manage tag_types"
  ON tag_types FOR ALL
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

-- Tags: Superadmin full access
CREATE POLICY "Superadmins can manage all tags"
  ON tags FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Tags: Org users can read their org's + global tags
CREATE POLICY "Org users can read tags"
  ON tags FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    OR organization_id IS NULL  -- Global tags
  );

-- Tags: Org admins can manage their org's tags
CREATE POLICY "Org admins can manage tags"
  ON tags FOR ALL
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

-- Tag Approval Queue: Superadmin full access
CREATE POLICY "Superadmins can manage tag approval queue"
  ON tag_approval_queue FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Tag Approval Queue: Org admins can manage their queue
CREATE POLICY "Org admins can manage their tag approval queue"
  ON tag_approval_queue FOR ALL
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

-- Tag Approval Queue: Editors can insert to queue
CREATE POLICY "Editors can insert to tag approval queue"
  ON tag_approval_queue FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('org_admin', 'editor')
    )
  );

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update updated_at timestamp
CREATE TRIGGER update_tag_types_updated_at
  BEFORE UPDATE ON tag_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON tags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Validate tag type_key exists in tag_types
CREATE OR REPLACE FUNCTION validate_tag_type_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tag_types
    WHERE key = NEW.type_key
      AND (
        organization_id = NEW.organization_id
        OR organization_id IS NULL  -- Global tag type
      )
  ) THEN
    RAISE EXCEPTION 'Tag type_key "%" does not exist for this organization', NEW.type_key;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_tag_type_key_trigger
  BEFORE INSERT OR UPDATE ON tags
  FOR EACH ROW
  EXECUTE FUNCTION validate_tag_type_key();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get enabled tag types for org (with global fallback)
CREATE OR REPLACE FUNCTION get_enabled_tag_types(org_id UUID)
RETURNS TABLE (
  id UUID,
  key TEXT,
  label TEXT,
  display_order INT
) AS $$
  -- Org-specific tag types override global ones
  SELECT DISTINCT ON (tt.key)
    tt.id,
    tt.key,
    tt.label,
    tt.display_order
  FROM tag_types tt
  WHERE tt.is_enabled = true
    AND (tt.organization_id = org_id OR tt.organization_id IS NULL)
  ORDER BY tt.key, tt.organization_id NULLS LAST, tt.display_order;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_enabled_tag_types(UUID) IS 'Get enabled tag types for org (org-specific overrides global)';

-- Get active tags for type and org
CREATE OR REPLACE FUNCTION get_active_tags(org_id UUID, p_type_key TEXT)
RETURNS TABLE (
  id UUID,
  value TEXT,
  slug TEXT
) AS $$
  SELECT DISTINCT ON (t.slug)
    t.id,
    t.value,
    t.slug
  FROM tags t
  WHERE t.is_active = true
    AND t.type_key = p_type_key
    AND (t.organization_id = org_id OR t.organization_id IS NULL)
  ORDER BY t.slug, t.organization_id NULLS LAST;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_active_tags(UUID, TEXT) IS 'Get active tags for type (org-specific overrides global)';

-- ============================================================================
-- Seed Data: Global Tag Types
-- ============================================================================

-- Insert global tag types (inherited by all orgs unless overridden)
INSERT INTO tag_types (organization_id, key, label, is_enabled, display_order) VALUES
  (NULL, 'domain', 'Domain', true, 0),
  (NULL, 'level', 'Level', true, 1),
  (NULL, 'theme', 'Theme', true, 2),
  (NULL, 'subject', 'Subject', true, 3),
  (NULL, 'class', 'Class', true, 4)
ON CONFLICT DO NOTHING;

-- Insert global tags (common values)
INSERT INTO tags (organization_id, type_key, value, slug, is_active) VALUES
  -- Domains
  (NULL, 'domain', 'Mathematics', 'mathematics', true),
  (NULL, 'domain', 'Science', 'science', true),
  (NULL, 'domain', 'Language Arts', 'language-arts', true),
  (NULL, 'domain', 'Social Studies', 'social-studies', true),
  (NULL, 'domain', 'Computer Science', 'computer-science', true),
  (NULL, 'domain', 'Medicine', 'medicine', true),
  
  -- Levels
  (NULL, 'level', 'Kindergarten', 'kindergarten', true),
  (NULL, 'level', 'Elementary', 'elementary', true),
  (NULL, 'level', 'Middle School', 'middle-school', true),
  (NULL, 'level', 'High School', 'high-school', true),
  (NULL, 'level', 'University', 'university', true),
  (NULL, 'level', 'Professional', 'professional', true),
  
  -- Themes (examples)
  (NULL, 'theme', 'Numbers', 'numbers', true),
  (NULL, 'theme', 'Time', 'time', true),
  (NULL, 'theme', 'Anatomy', 'anatomy', true),
  (NULL, 'theme', 'Grammar', 'grammar', true)
ON CONFLICT DO NOTHING;

