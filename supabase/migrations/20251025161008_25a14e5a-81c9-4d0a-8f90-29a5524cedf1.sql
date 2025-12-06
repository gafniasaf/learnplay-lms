-- Add triggers and functions for tags
CREATE TRIGGER update_tag_types_updated_at
  BEFORE UPDATE ON tag_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON tags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Validation function
CREATE OR REPLACE FUNCTION validate_tag_type_key()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tag_types
    WHERE key = NEW.type_key
      AND (organization_id = NEW.organization_id OR organization_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Tag type_key "%" does not exist for this organization', NEW.type_key;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tag_type_key_trigger
  BEFORE INSERT OR UPDATE ON tags
  FOR EACH ROW
  EXECUTE FUNCTION validate_tag_type_key();

-- Helper functions
CREATE OR REPLACE FUNCTION get_enabled_tag_types(org_id UUID)
RETURNS TABLE (id UUID, key TEXT, label TEXT, display_order INT) 
LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT DISTINCT ON (tt.key) tt.id, tt.key, tt.label, tt.display_order
  FROM tag_types tt
  WHERE tt.is_enabled = true AND (tt.organization_id = org_id OR tt.organization_id IS NULL)
  ORDER BY tt.key, tt.organization_id NULLS LAST, tt.display_order;
$$;

CREATE OR REPLACE FUNCTION get_active_tags(org_id UUID, p_type_key TEXT)
RETURNS TABLE (id UUID, value TEXT, slug TEXT) 
LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT DISTINCT ON (t.slug) t.id, t.value, t.slug
  FROM tags t
  WHERE t.is_active = true AND t.type_key = p_type_key 
    AND (t.organization_id = org_id OR t.organization_id IS NULL)
  ORDER BY t.slug, t.organization_id NULLS LAST;
$$;