-- Multi-Tenant Course Metadata and Versions
-- Part 4: Course Metadata and Version Snapshots

-- ============================================================================
-- Tables
-- ============================================================================

-- Course metadata (relational layer for JSON courses in storage)
CREATE TABLE IF NOT EXISTS course_metadata (
  id TEXT PRIMARY KEY,                    -- matches course file id (e.g., 'heart-anatomy')
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('org', 'global')) DEFAULT 'org',
  tag_ids UUID[] DEFAULT '{}',            -- References tags.id (denormalized for perf)
  content_version INT DEFAULT 1,
  etag INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_course_metadata_org ON course_metadata(organization_id);
CREATE INDEX idx_course_metadata_visibility ON course_metadata(visibility);
CREATE INDEX idx_course_metadata_tags ON course_metadata USING GIN(tag_ids);
CREATE INDEX idx_course_metadata_updated ON course_metadata(updated_at DESC);

COMMENT ON TABLE course_metadata IS 'Relational metadata for courses (JSON files live in storage)';
COMMENT ON COLUMN course_metadata.id IS 'Matches course JSON file name';
COMMENT ON COLUMN course_metadata.visibility IS 'org = private to org, global = shared library (read-only to others)';
COMMENT ON COLUMN course_metadata.tag_ids IS 'Denormalized array of curated tag UUIDs';
COMMENT ON COLUMN course_metadata.content_version IS 'Bumped on each publish';
COMMENT ON COLUMN course_metadata.etag IS 'Bumped on each save (draft or publish)';

-- Course versions (full JSON snapshots on publish)
CREATE TABLE IF NOT EXISTS course_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,                -- FK to course_metadata.id
  version INT NOT NULL,
  snapshot JSONB NOT NULL,                -- Full course JSON at publish
  published_by UUID NOT NULL REFERENCES auth.users(id),
  published_at TIMESTAMPTZ DEFAULT now(),
  changelog TEXT,
  etag INT NOT NULL,
  UNIQUE (course_id, version)
);

CREATE INDEX idx_course_versions_course ON course_versions(course_id, version DESC);
CREATE INDEX idx_course_versions_published ON course_versions(published_at DESC);
CREATE INDEX idx_course_versions_user ON course_versions(published_by);

COMMENT ON TABLE course_versions IS 'Full JSON snapshots on publish (for versioning/rollback)';
COMMENT ON COLUMN course_versions.snapshot IS 'Complete course JSON including items, variants, tags';
COMMENT ON COLUMN course_versions.version IS 'Sequential version number per course';
COMMENT ON COLUMN course_versions.changelog IS 'Human-readable description of changes';
COMMENT ON COLUMN course_versions.etag IS 'Course etag at time of publish';

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Enable RLS
ALTER TABLE course_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_versions ENABLE ROW LEVEL SECURITY;

-- Course Metadata: Superadmin full access
CREATE POLICY "Superadmins can manage all course metadata"
  ON course_metadata FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Course Metadata: Org users can read org courses + global courses
CREATE POLICY "Org users can read org and global courses"
  ON course_metadata FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    OR visibility = 'global'
  );

-- Course Metadata: Editors can manage org courses
CREATE POLICY "Editors can manage org courses"
  ON course_metadata FOR ALL
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

-- Course Versions: Superadmin full access
CREATE POLICY "Superadmins can manage all course versions"
  ON course_versions FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Course Versions: Org admins/editors can read own org course versions
CREATE POLICY "Org users can read own org course versions"
  ON course_versions FOR SELECT
  USING (
    course_id IN (
      SELECT id FROM course_metadata
      WHERE organization_id IN (SELECT get_user_org_ids())
    )
  );

-- Course Versions: Org admins/editors can create versions for own org courses
CREATE POLICY "Org editors can create course versions"
  ON course_versions FOR INSERT
  WITH CHECK (
    course_id IN (
      SELECT id FROM course_metadata
      WHERE organization_id IN (
        SELECT organization_id FROM user_roles
        WHERE user_id = auth.uid() AND role IN ('org_admin', 'editor')
      )
    )
  );

-- ============================================================================
-- Triggers
-- ============================================================================

-- Update updated_at timestamp
CREATE TRIGGER update_course_metadata_updated_at
  BEFORE UPDATE ON course_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-increment version number
CREATE OR REPLACE FUNCTION auto_increment_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version), 0) + 1
  INTO NEW.version
  FROM course_versions
  WHERE course_id = NEW.course_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_increment_version_trigger
  BEFORE INSERT ON course_versions
  FOR EACH ROW
  WHEN (NEW.version IS NULL)
  EXECUTE FUNCTION auto_increment_version();

-- Validate tag_ids reference existing tags
CREATE OR REPLACE FUNCTION validate_tag_ids()
RETURNS TRIGGER AS $$
DECLARE
  invalid_tags UUID[];
BEGIN
  -- Check if all tag_ids exist
  SELECT ARRAY_AGG(tag_id)
  INTO invalid_tags
  FROM unnest(NEW.tag_ids) AS tag_id
  WHERE NOT EXISTS (
    SELECT 1 FROM tags WHERE id = tag_id
  );
  
  IF array_length(invalid_tags, 1) > 0 THEN
    RAISE EXCEPTION 'Invalid tag IDs: %', invalid_tags;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_tag_ids_trigger
  BEFORE INSERT OR UPDATE ON course_metadata
  FOR EACH ROW
  WHEN (array_length(NEW.tag_ids, 1) > 0)
  EXECUTE FUNCTION validate_tag_ids();

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Get latest version for course
CREATE OR REPLACE FUNCTION get_latest_version(p_course_id TEXT)
RETURNS INT AS $$
  SELECT COALESCE(MAX(version), 0)
  FROM course_versions
  WHERE course_id = p_course_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_latest_version(TEXT) IS 'Get highest version number for course';

-- Get version snapshot
CREATE OR REPLACE FUNCTION get_version_snapshot(p_course_id TEXT, p_version INT)
RETURNS JSONB AS $$
  SELECT snapshot
  FROM course_versions
  WHERE course_id = p_course_id
    AND version = p_version
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_version_snapshot(TEXT, INT) IS 'Get JSON snapshot for specific version';

-- List course versions
CREATE OR REPLACE FUNCTION list_course_versions(p_course_id TEXT)
RETURNS TABLE (
  version INT,
  published_at TIMESTAMPTZ,
  published_by_email TEXT,
  changelog TEXT,
  etag INT
) AS $$
  SELECT
    cv.version,
    cv.published_at,
    u.email AS published_by_email,
    cv.changelog,
    cv.etag
  FROM course_versions cv
  LEFT JOIN auth.users u ON cv.published_by = u.id
  WHERE cv.course_id = p_course_id
  ORDER BY cv.version DESC;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION list_course_versions(TEXT) IS 'List all versions for a course with metadata';

-- Restore course to specific version (creates new version)
CREATE OR REPLACE FUNCTION restore_course_version(
  p_course_id TEXT,
  p_restore_from_version INT,
  p_changelog TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_snapshot JSONB;
  v_new_version_id UUID;
  v_etag INT;
BEGIN
  -- Get snapshot from target version
  SELECT snapshot, etag
  INTO v_snapshot, v_etag
  FROM course_versions
  WHERE course_id = p_course_id
    AND version = p_restore_from_version;
  
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Version % not found for course %', p_restore_from_version, p_course_id;
  END IF;
  
  -- Bump etag
  UPDATE course_metadata
  SET etag = etag + 1,
      content_version = content_version + 1
  WHERE id = p_course_id
  RETURNING etag INTO v_etag;
  
  -- Create new version with restored snapshot
  INSERT INTO course_versions (course_id, snapshot, published_by, changelog, etag)
  VALUES (
    p_course_id,
    v_snapshot,
    auth.uid(),
    COALESCE(p_changelog, 'Restored from version ' || p_restore_from_version),
    v_etag
  )
  RETURNING id INTO v_new_version_id;
  
  RETURN v_new_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION restore_course_version(TEXT, INT, TEXT) IS 'Restore course to version (creates new version, non-destructive)';

-- Get courses by tag filters
CREATE OR REPLACE FUNCTION get_courses_by_tags(
  p_organization_id UUID,
  p_tag_ids UUID[] DEFAULT '{}',
  p_match_all BOOLEAN DEFAULT false
)
RETURNS SETOF course_metadata AS $$
BEGIN
  IF array_length(p_tag_ids, 1) IS NULL OR array_length(p_tag_ids, 1) = 0 THEN
    -- No filters: return all org courses + global courses
    RETURN QUERY
    SELECT * FROM course_metadata
    WHERE organization_id = p_organization_id OR visibility = 'global'
    ORDER BY updated_at DESC;
  ELSIF p_match_all THEN
    -- AND logic: course must have all specified tags
    RETURN QUERY
    SELECT * FROM course_metadata
    WHERE (organization_id = p_organization_id OR visibility = 'global')
      AND tag_ids @> p_tag_ids
    ORDER BY updated_at DESC;
  ELSE
    -- OR logic: course must have at least one tag
    RETURN QUERY
    SELECT * FROM course_metadata
    WHERE (organization_id = p_organization_id OR visibility = 'global')
      AND tag_ids && p_tag_ids
    ORDER BY updated_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_courses_by_tags(UUID, UUID[], BOOLEAN) IS 'Filter courses by tags with AND/OR logic';

