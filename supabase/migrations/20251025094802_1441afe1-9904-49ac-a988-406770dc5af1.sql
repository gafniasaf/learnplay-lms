-- Add embedding column to existing media_assets table
ALTER TABLE public.media_assets 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create ivfflat index for fast similarity search (cosine distance)
-- Using lists = rows/1000 as recommended, with minimum of 10
CREATE INDEX IF NOT EXISTS media_assets_embedding_idx 
ON public.media_assets 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add comment for documentation
COMMENT ON COLUMN public.media_assets.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions) for semantic search';