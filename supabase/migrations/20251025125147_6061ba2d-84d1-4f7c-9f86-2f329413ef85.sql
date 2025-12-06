-- Create media_assets table for semantic search over Supabase storage
-- Migration: 20251025000001_media_assets_table
-- Description: Table to store metadata and embeddings for all media files in storage
-- NOTE: Table may already exist with different schema; this will skip if exists

-- Create media_assets table
CREATE TABLE IF NOT EXISTS media_assets_search (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  alt_text TEXT,
  tags TEXT[],
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  embedding vector(1536),
  UNIQUE(bucket, path)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_media_assets_search_bucket_mime 
  ON media_assets_search (bucket, mime_type);

CREATE INDEX IF NOT EXISTS idx_media_assets_search_uploaded_by 
  ON media_assets_search (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_media_assets_search_created_at 
  ON media_assets_search (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_assets_search_tags 
  ON media_assets_search USING GIN (tags);

-- Create vector similarity search index (IVFFlat for balanced performance)
CREATE INDEX IF NOT EXISTS idx_media_assets_search_embedding 
  ON media_assets_search USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Enable Row Level Security
ALTER TABLE media_assets_search ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can read all media_assets_search
CREATE POLICY "Admins can read all media_assets_search"
  ON media_assets_search
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM profiles 
      WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can insert media_assets_search
CREATE POLICY "Admins can insert media_assets_search"
  ON media_assets_search
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM profiles 
      WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can update media_assets_search
CREATE POLICY "Admins can update media_assets_search"
  ON media_assets_search
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 
      FROM profiles 
      WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can delete media_assets_search
CREATE POLICY "Admins can delete media_assets_search"
  ON media_assets_search
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
CREATE OR REPLACE FUNCTION update_media_assets_search_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER media_assets_search_updated_at
  BEFORE UPDATE ON media_assets_search
  FOR EACH ROW
  EXECUTE FUNCTION update_media_assets_search_updated_at();

-- Add comments for documentation
COMMENT ON TABLE media_assets_search IS 'Stores metadata and embeddings for semantic search over media files in Supabase storage (separate from main media_assets table)';
COMMENT ON COLUMN media_assets_search.embedding IS 'Vector embedding (1536 dimensions) generated from alt_text, tags, and filename using OpenAI text-embedding-3-small';