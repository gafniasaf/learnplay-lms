-- Enable pgvector extension for semantic search
-- Migration: 20251025000000_enable_pgvector
-- Description: Adds pgvector extension to enable vector similarity search for media and content

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify extension is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    RAISE EXCEPTION 'pgvector extension failed to install';
  END IF;
END
$$;

-- Comment for documentation
COMMENT ON EXTENSION vector IS 'Vector similarity search for semantic search over media and course content';