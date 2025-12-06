-- Create media_assets table for semantic search over Supabase storage
-- Migration: 20251025000001_media_assets_table
-- Description: Table to store metadata and embeddings for all media files in storage

-- Create media_assets table
CREATE TABLE IF NOT EXISTS media_assets (
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
CREATE INDEX IF NOT EXISTS idx_media_assets_bucket_mime 
  ON media_assets (bucket, mime_type);

CREATE INDEX IF NOT EXISTS idx_media_assets_uploaded_by 
  ON media_assets (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_media_assets_created_at 
  ON media_assets (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_assets_tags 
  ON media_assets USING GIN (tags);

-- Create vector similarity search index (IVFFlat for balanced performance)
-- Lists parameter tuned for ~1000-10000 vectors; adjust as dataset grows
CREATE INDEX IF NOT EXISTS idx_media_assets_embedding 
  ON media_assets USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Enable Row Level Security
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Admins can read all media_assets
CREATE POLICY "Admins can read all media_assets"
  ON media_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM profiles 
      WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can insert media_assets
CREATE POLICY "Admins can insert media_assets"
  ON media_assets
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM profiles 
      WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can update media_assets
CREATE POLICY "Admins can update media_assets"
  ON media_assets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 
      FROM profiles 
      WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can delete media_assets
CREATE POLICY "Admins can delete media_assets"
  ON media_assets
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
CREATE OR REPLACE FUNCTION update_media_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER media_assets_updated_at
  BEFORE UPDATE ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_media_assets_updated_at();

-- Add comments for documentation
COMMENT ON TABLE media_assets IS 'Stores metadata and embeddings for semantic search over media files in Supabase storage';
COMMENT ON COLUMN media_assets.embedding IS 'Vector embedding (1536 dimensions) generated from alt_text, tags, and filename using OpenAI text-embedding-3-small';
COMMENT ON COLUMN media_assets.bucket IS 'Supabase storage bucket name (e.g., "media")';
COMMENT ON COLUMN media_assets.path IS 'Full path within bucket (e.g., "courses/{courseId}/{itemId}/image.png")';
COMMENT ON COLUMN media_assets.tags IS 'Array of searchable tags for filtering (e.g., ["clock", "time", "24-hour"])';
COMMENT ON COLUMN media_assets.duration_ms IS 'Duration in milliseconds for audio/video files';

