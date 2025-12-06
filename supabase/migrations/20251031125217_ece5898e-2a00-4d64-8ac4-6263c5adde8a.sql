
-- Add created_by column to tags table for audit trail
ALTER TABLE public.tags 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Update existing tags to have a created_by (set to first superadmin or NULL)
UPDATE public.tags 
SET created_by = (
  SELECT user_id 
  FROM public.user_roles 
  WHERE role = 'superadmin' 
    AND organization_id IS NULL 
  LIMIT 1
)
WHERE created_by IS NULL;

-- Add unique constraint for org-specific tags
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_org_type_slug 
ON public.tags(organization_id, type_key, slug);

-- Add unique constraint for global tags (where org_id is NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_global_type_slug 
ON public.tags(type_key, slug) 
WHERE organization_id IS NULL;

-- Add other indexes for performance
CREATE INDEX IF NOT EXISTS idx_tags_type_key ON public.tags(type_key);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON public.tags(slug);
CREATE INDEX IF NOT EXISTS idx_tags_org_id ON public.tags(organization_id);
CREATE INDEX IF NOT EXISTS idx_tags_is_active ON public.tags(is_active) WHERE is_active = true;

-- Drop existing policies to recreate them more explicitly
DROP POLICY IF EXISTS "org_admins_manage_org_tags" ON public.tags;
DROP POLICY IF EXISTS "superadmins_manage_tags" ON public.tags;
DROP POLICY IF EXISTS "users_view_org_tags" ON public.tags;

-- Recreate RLS policies with explicit admin-only insert
-- Superadmins can manage all tags
CREATE POLICY "superadmins_manage_all_tags"
ON public.tags
FOR ALL
TO authenticated
USING (is_superadmin(auth.uid()))
WITH CHECK (is_superadmin(auth.uid()));

-- Org admins can manage org-specific tags
CREATE POLICY "org_admins_manage_org_tags"
ON public.tags
FOR ALL
TO authenticated
USING (
  organization_id IS NOT NULL 
  AND user_has_org_role(auth.uid(), organization_id, ARRAY['school_admin'::text])
)
WITH CHECK (
  organization_id IS NOT NULL 
  AND user_has_org_role(auth.uid(), organization_id, ARRAY['school_admin'::text])
);

-- All authenticated users can view active tags
CREATE POLICY "users_view_active_tags"
ON public.tags
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (organization_id IS NULL OR user_in_org(auth.uid(), organization_id))
);

-- Insert additional sample tags for better demo coverage
-- Using INSERT ... WHERE NOT EXISTS to avoid duplicates
INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'domain', 'Arts', 'arts', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'domain' AND slug = 'arts' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'domain', 'Physical Education', 'physical-education', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'domain' AND slug = 'physical-education' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'domain', 'Music', 'music', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'domain' AND slug = 'music' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'level', 'College', 'college', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'level' AND slug = 'college' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'level', 'Professional', 'professional', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'level' AND slug = 'professional' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'theme', 'Problem Solving', 'problem-solving', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'theme' AND slug = 'problem-solving' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'theme', 'Critical Thinking', 'critical-thinking', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'theme' AND slug = 'critical-thinking' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'theme', 'Collaboration', 'collaboration', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'theme' AND slug = 'collaboration' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'theme', 'Creativity', 'creativity', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'theme' AND slug = 'creativity' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'theme', 'Communication', 'communication', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'theme' AND slug = 'communication' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'theme', 'Real World', 'real-world', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'theme' AND slug = 'real-world' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'theme', 'STEM', 'stem', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'theme' AND slug = 'stem' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'Algebra', 'algebra', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'algebra' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'Geometry', 'geometry', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'geometry' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'Biology', 'biology', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'biology' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'Chemistry', 'chemistry', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'chemistry' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'Physics', 'physics', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'physics' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'History', 'history', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'history' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'Geography', 'geography', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'geography' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'Literature', 'literature', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'literature' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'Writing', 'writing', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'writing' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'subject', 'Reading', 'reading', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'subject' AND slug = 'reading' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'class', 'Morning', 'morning', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'class' AND slug = 'morning' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'class', 'Afternoon', 'afternoon', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'class' AND slug = 'afternoon' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'class', 'Honors', 'honors', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'class' AND slug = 'honors' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'class', 'AP', 'ap', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'class' AND slug = 'ap' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'class', 'Remedial', 'remedial', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'class' AND slug = 'remedial' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'class', 'Online', 'online', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'class' AND slug = 'online' AND organization_id IS NULL);

INSERT INTO public.tags (type_key, value, slug, is_active, organization_id)
SELECT 'class', 'Hybrid', 'hybrid', true, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE type_key = 'class' AND slug = 'hybrid' AND organization_id IS NULL);
