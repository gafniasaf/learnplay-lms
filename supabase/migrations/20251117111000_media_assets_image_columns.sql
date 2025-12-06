-- Add image-related columns to media_assets with idempotency and indexing

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'course_id'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN course_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'item_id'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN item_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'purpose'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN purpose TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN source JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'alt_text'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN alt_text TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'media_assets' AND column_name = 'etag'
  ) THEN
    ALTER TABLE public.media_assets ADD COLUMN etag BIGINT;
  END IF;
END $$;

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_media_assets_course_item_purpose
  ON public.media_assets (course_id, item_id, purpose);

-- Functional index for dedup by signature hash inside source JSON
-- Note: stores hash string; ensure stable key name in code: source->>'hash'
CREATE INDEX IF NOT EXISTS idx_media_assets_source_hash
  ON public.media_assets ((source->>'hash'));


