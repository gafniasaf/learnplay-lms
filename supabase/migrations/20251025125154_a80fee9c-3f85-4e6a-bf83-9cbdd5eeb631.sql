-- Add embedding column and index to existing content_embeddings table if not present
-- Migration: 20251025000002_content_embeddings_table
-- Description: Adds vector embedding column and ivfflat index for semantic search

-- Add embedding column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'content_embeddings' 
    AND column_name = 'embedding'
  ) THEN
    ALTER TABLE content_embeddings ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- Create vector similarity search index (IVFFlat for balanced performance)
CREATE INDEX IF NOT EXISTS idx_content_embeddings_embedding
  ON content_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Add metadata column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'content_embeddings' 
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE content_embeddings ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Ensure updated_at trigger exists
CREATE OR REPLACE FUNCTION update_content_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_embeddings_updated_at ON content_embeddings;
CREATE TRIGGER content_embeddings_updated_at
  BEFORE UPDATE ON content_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_content_embeddings_updated_at();

-- Add comments for documentation
COMMENT ON COLUMN content_embeddings.embedding IS 'Vector embedding (1536 dimensions) generated from text_content using OpenAI text-embedding-3-small';