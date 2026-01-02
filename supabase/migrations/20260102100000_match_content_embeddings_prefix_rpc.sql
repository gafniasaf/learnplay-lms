-- RPC helper for prefix-scoped semantic matching against content_embeddings (org-scoped)
-- Used by TeacherGPT retrieval: match across multiple namespaces (e.g. material:, mes:) by course_id prefix.

CREATE OR REPLACE FUNCTION public.match_content_embeddings_prefix(
  p_organization_id UUID,
  p_course_id_prefix TEXT,
  p_query_embedding FLOAT8[],
  p_limit INT DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  course_id TEXT,
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
    ce.course_id,
    ce.item_index,
    ce.text_content,
    1 - (ce.embedding <=> (p_query_embedding::vector(1536))) AS similarity
  FROM public.content_embeddings ce
  WHERE ce.organization_id = p_organization_id
    -- Treat prefix as literal text (escape LIKE wildcards) to avoid surprises when prefixes contain '_' or '%'.
    AND ce.course_id LIKE (
      replace(
        replace(
          replace(COALESCE(p_course_id_prefix, ''), E'\\', E'\\\\'),
          '%',
          E'\\%'
        ),
        '_',
        E'\\_'
      ) || '%'
    ) ESCAPE E'\\'
    AND ce.content_type = 'reference'
    AND ce.embedding IS NOT NULL
  ORDER BY ce.embedding <=> (p_query_embedding::vector(1536))
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50);
$$;

GRANT EXECUTE ON FUNCTION public.match_content_embeddings_prefix(UUID, TEXT, FLOAT8[], INT) TO service_role;

-- Force PostgREST schema cache reload (so the RPC is visible immediately)
NOTIFY pgrst, 'reload schema';


