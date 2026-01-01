-- Content embeddings table (org-scoped) used by the Materials pipeline (material_ingest/material_analyze)
-- IMPORTANT: This repo's live project may not have the older "profiles"-based embeddings migrations applied.
-- This migration is self-contained and enforces org isolation via JWT metadata (app_metadata/user_metadata).

-- 1) pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Table
CREATE TABLE IF NOT EXISTS public.content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  group_index INTEGER,
  item_index INTEGER,
  content_type TEXT NOT NULL CHECK (content_type IN ('stem', 'option', 'reference')),
  option_id TEXT,
  text_content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_type_option_id_check
    CHECK (
      (content_type = 'option' AND option_id IS NOT NULL) OR
      (content_type IN ('stem', 'reference') AND option_id IS NULL)
    )
);

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_content_embeddings_org ON public.content_embeddings(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_org_course ON public.content_embeddings(organization_id, course_id);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_course_location ON public.content_embeddings(course_id, group_index, item_index);
CREATE INDEX IF NOT EXISTS idx_content_embeddings_content_type ON public.content_embeddings(content_type);

-- Vector index (IVFFlat for balanced performance)
CREATE INDEX IF NOT EXISTS idx_content_embeddings_embedding
  ON public.content_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4) updated_at trigger
CREATE OR REPLACE FUNCTION public.update_content_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS content_embeddings_updated_at ON public.content_embeddings;
CREATE TRIGGER content_embeddings_updated_at
  BEFORE UPDATE ON public.content_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_content_embeddings_updated_at();

-- 5) RLS (org isolation)
ALTER TABLE public.content_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_embeddings_org_read" ON public.content_embeddings;
DROP POLICY IF EXISTS "content_embeddings_org_insert" ON public.content_embeddings;
DROP POLICY IF EXISTS "content_embeddings_org_update" ON public.content_embeddings;
DROP POLICY IF EXISTS "content_embeddings_org_delete" ON public.content_embeddings;

-- Use organization_id from JWT metadata (app_metadata preferred, fallback to user_metadata).
-- Compare as text to avoid UUID cast exceptions on malformed tokens.
CREATE POLICY "content_embeddings_org_read"
  ON public.content_embeddings
  FOR SELECT
  USING (
    organization_id::text = COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'organization_id',
      auth.jwt() -> 'user_metadata' ->> 'organization_id'
    )
  );

CREATE POLICY "content_embeddings_org_insert"
  ON public.content_embeddings
  FOR INSERT
  WITH CHECK (
    organization_id::text = COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'organization_id',
      auth.jwt() -> 'user_metadata' ->> 'organization_id'
    )
  );

CREATE POLICY "content_embeddings_org_update"
  ON public.content_embeddings
  FOR UPDATE
  USING (
    organization_id::text = COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'organization_id',
      auth.jwt() -> 'user_metadata' ->> 'organization_id'
    )
  )
  WITH CHECK (
    organization_id::text = COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'organization_id',
      auth.jwt() -> 'user_metadata' ->> 'organization_id'
    )
  );

CREATE POLICY "content_embeddings_org_delete"
  ON public.content_embeddings
  FOR DELETE
  USING (
    organization_id::text = COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'organization_id',
      auth.jwt() -> 'user_metadata' ->> 'organization_id'
    )
  );

-- 6) Force PostgREST schema cache reload (so Edge/PostgREST sees the new table immediately)
NOTIFY pgrst, 'reload schema';



