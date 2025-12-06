-- Create content_embeddings table for semantic search over course content
-- Migration: 20251025000002_content_embeddings_table
-- Description: Table to store embeddings for course stems, options, and reference text

-- Create content_embeddings table
CREATE TABLE IF NOT EXISTS content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,
  group_index INTEGER,
  item_index INTEGER,
  content_type TEXT NOT NULL CHECK (content_type IN ('stem', 'option', 'reference')),
  option_id TEXT,
  text_content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT content_type_option_id_check 
    CHECK (
      (content_type = 'option' AND option_id IS NOT NULL) OR
      (content_type IN ('stem', 'reference') AND option_id IS NULL)
    )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_embeddings_course_location
  ON content_embeddings (course_id, group_index, item_index);

CREATE INDEX IF NOT EXISTS idx_content_embeddings_content_type
  ON content_embeddings (content_type);

CREATE INDEX IF NOT EXISTS idx_content_embeddings_course_id
  ON content_embeddings (course_id);

CREATE INDEX IF NOT EXISTS idx_content_embeddings_created_at
  ON content_embeddings (created_at DESC);

-- Create vector similarity search index (IVFFlat for balanced performance)
-- Lists parameter tuned for ~10000-100000 vectors; adjust as dataset grows
CREATE INDEX IF NOT EXISTS idx_content_embeddings_embedding
  ON content_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Enable Row Level Security
ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can read all content_embeddings
CREATE POLICY "Admins can read all content_embeddings"
  ON content_embeddings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can insert content_embeddings
CREATE POLICY "Admins can insert content_embeddings"
  ON content_embeddings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can update content_embeddings
CREATE POLICY "Admins can update content_embeddings"
  ON content_embeddings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can delete content_embeddings
CREATE POLICY "Admins can delete content_embeddings"
  ON content_embeddings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_content_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_embeddings_updated_at
  BEFORE UPDATE ON content_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_content_embeddings_updated_at();

-- Add comments for documentation
COMMENT ON TABLE content_embeddings IS 'Stores embeddings for semantic search over course content (stems, options, reference text)';
COMMENT ON COLUMN content_embeddings.embedding IS 'Vector embedding (1536 dimensions) generated from text_content using OpenAI text-embedding-3-small';
COMMENT ON COLUMN content_embeddings.course_id IS 'Course identifier (e.g., "time-grade-1")';
COMMENT ON COLUMN content_embeddings.group_index IS 'Zero-based index of group within course';
COMMENT ON COLUMN content_embeddings.item_index IS 'Zero-based index of item within group';
COMMENT ON COLUMN content_embeddings.content_type IS 'Type of content: "stem", "option", or "reference"';
COMMENT ON COLUMN content_embeddings.option_id IS 'Option identifier (required when content_type="option", null otherwise)';
COMMENT ON COLUMN content_embeddings.text_content IS 'The text content from which the embedding was generated';

