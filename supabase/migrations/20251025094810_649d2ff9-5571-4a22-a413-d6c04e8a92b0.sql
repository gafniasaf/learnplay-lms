-- Create content_embeddings table for course content semantic search
CREATE TABLE IF NOT EXISTS public.content_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id text NOT NULL,
  item_id integer NOT NULL,
  content_type text NOT NULL, -- 'question', 'answer', 'distractor', 'explanation'
  content_text text NOT NULL,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Unique constraint to prevent duplicates
  UNIQUE(course_id, item_id, content_type)
);

-- Enable RLS
ALTER TABLE public.content_embeddings ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for content_embeddings
CREATE POLICY "Admins can manage content embeddings"
ON public.content_embeddings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Create ivfflat index for fast similarity search
CREATE INDEX content_embeddings_embedding_idx 
ON public.content_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Indexes for common queries
CREATE INDEX content_embeddings_course_id_idx ON public.content_embeddings(course_id);
CREATE INDEX content_embeddings_content_type_idx ON public.content_embeddings(content_type);

-- Updated_at trigger
CREATE TRIGGER set_content_embeddings_updated_at
  BEFORE UPDATE ON public.content_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.content_embeddings IS 'Stores embeddings for course content items for semantic search';
COMMENT ON COLUMN public.content_embeddings.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';