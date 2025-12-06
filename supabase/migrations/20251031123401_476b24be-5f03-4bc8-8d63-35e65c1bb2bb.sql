-- Create course_tag_map view for easier tag filtering
CREATE OR REPLACE VIEW public.course_tag_map AS
SELECT 
  cm.id as course_id,
  cm.organization_id,
  unnest(cm.tag_ids) as tag_id
FROM public.course_metadata cm
WHERE cm.tag_ids IS NOT NULL AND array_length(cm.tag_ids, 1) > 0;

-- Add indexes for efficient search and filtering
CREATE INDEX IF NOT EXISTS idx_course_metadata_tags ON public.course_metadata USING GIN (tag_ids);
CREATE INDEX IF NOT EXISTS idx_course_metadata_search ON public.course_metadata USING GIN (to_tsvector('english', id));
CREATE INDEX IF NOT EXISTS idx_course_metadata_org_visibility ON public.course_metadata (organization_id, visibility);

COMMENT ON VIEW public.course_tag_map IS 'Maps courses to their tags for efficient filtering';
COMMENT ON INDEX idx_course_metadata_tags IS 'GIN index for tag array filtering';
COMMENT ON INDEX idx_course_metadata_search IS 'Full-text search index on course ID';
COMMENT ON INDEX idx_course_metadata_org_visibility IS 'Composite index for org and visibility filtering';
