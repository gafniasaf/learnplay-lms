-- Migration 3 Fixed: Tag Types and Tags (without COALESCE in constraint)
CREATE TABLE IF NOT EXISTS tag_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint using expression index
CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_types_unique_key 
  ON tag_types(COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

CREATE INDEX IF NOT EXISTS idx_tag_types_org ON tag_types(organization_id);
CREATE INDEX IF NOT EXISTS idx_tag_types_enabled ON tag_types(organization_id, is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_tag_types_order ON tag_types(organization_id, display_order);

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type_key TEXT NOT NULL,
  value TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint using expression index
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_slug
  ON tags(COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), type_key, slug);

CREATE INDEX IF NOT EXISTS idx_tags_org_type ON tags(organization_id, type_key);
CREATE INDEX IF NOT EXISTS idx_tags_active ON tags(organization_id, type_key, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(type_key, slug);

-- Tag approval queue
CREATE TABLE IF NOT EXISTS tag_approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  suggested_tags JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  mapped_tag_ids UUID[],
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tag_approval_org ON tag_approval_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_tag_approval_course ON tag_approval_queue(course_id);
CREATE INDEX IF NOT EXISTS idx_tag_approval_status ON tag_approval_queue(organization_id, status) WHERE status = 'pending';