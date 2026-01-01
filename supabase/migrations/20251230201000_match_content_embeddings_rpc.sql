-- RPC helper for semantic matching against content_embeddings (org-scoped)
-- Used by standards_map to match standards items against material chunk embeddings.

CREATE OR REPLACE FUNCTION public.match_content_embeddings(
  p_organization_id UUID,
  p_course_id TEXT,
  p_query_embedding FLOAT8[],
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  item_index INT,
  text_content TEXT,
  similarity FLOAT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    ce.id,
    ce.item_index,
    ce.text_content,
    1 - (ce.embedding <=> (p_query_embedding::vector(1536))) AS similarity
  FROM public.content_embeddings ce
  WHERE ce.organization_id = p_organization_id
    AND ce.course_id = p_course_id
    AND ce.content_type = 'reference'
    AND ce.embedding IS NOT NULL
  ORDER BY ce.embedding <=> (p_query_embedding::vector(1536))
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.match_content_embeddings(UUID, TEXT, FLOAT8[], INT) TO service_role;



