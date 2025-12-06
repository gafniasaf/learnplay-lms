-- Migration 4: Course Metadata and Versions
CREATE TABLE IF NOT EXISTS course_metadata (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('org', 'global')) DEFAULT 'org',
  tag_ids UUID[] DEFAULT '{}',
  tags JSONB DEFAULT '{}'::jsonb,
  content_version INT NOT NULL DEFAULT 1,
  etag INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_metadata_org ON course_metadata(organization_id);
CREATE INDEX IF NOT EXISTS idx_course_metadata_visibility ON course_metadata(visibility);
CREATE INDEX IF NOT EXISTS idx_course_metadata_tags ON course_metadata USING GIN(tag_ids);
CREATE INDEX IF NOT EXISTS idx_course_metadata_tags_jsonb ON course_metadata USING GIN(tags);

CREATE TABLE IF NOT EXISTS course_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL REFERENCES course_metadata(id) ON DELETE CASCADE,
  version INT NOT NULL,
  storage_path TEXT NOT NULL,
  published_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ DEFAULT now(),
  change_summary TEXT,
  metadata_snapshot JSONB,
  UNIQUE (course_id, version)
);

CREATE INDEX IF NOT EXISTS idx_course_versions_course ON course_versions(course_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_course_versions_published ON course_versions(published_at DESC);

-- Trigger for course_metadata
CREATE TRIGGER update_course_metadata_updated_at
  BEFORE UPDATE ON course_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();