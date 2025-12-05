-- ============================================
-- LEARNPLAY PLATFORM - DATABASE SETUP PART 2
-- MEDIA, AI JOBS, MESSAGING, ACHIEVEMENTS
-- ============================================

-- ============================================
-- PART 5: MEDIA ASSETS AND AI JOBS
-- ============================================

-- Table: ai_course_jobs
CREATE TABLE IF NOT EXISTS public.ai_course_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  grade_band TEXT NOT NULL,
  grade TEXT,
  mode TEXT NOT NULL,
  items_per_group INTEGER NOT NULL DEFAULT 12,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  idempotency_key TEXT UNIQUE,
  progress_stage TEXT DEFAULT 'queued'::text,
  progress_percent INTEGER DEFAULT 0,
  progress_message TEXT,
  error TEXT,
  result_path TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  generation_duration_ms BIGINT,
  processing_duration_ms BIGINT,
  last_heartbeat TIMESTAMP WITH TIME ZONE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  PRIMARY KEY (id)
);
ALTER TABLE public.ai_course_jobs ENABLE ROW LEVEL SECURITY;

-- Table: ai_media_jobs
CREATE TABLE IF NOT EXISTS public.ai_media_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  style TEXT,
  target_ref JSONB,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  priority INTEGER DEFAULT 100,
  attempts INTEGER DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  result_url TEXT,
  error TEXT,
  cost_usd NUMERIC,
  asset_version INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  last_heartbeat TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  dead_letter_reason TEXT,
  PRIMARY KEY (id)
);
ALTER TABLE public.ai_media_jobs ENABLE ROW LEVEL SECURITY;

-- Table: media_generation_providers
CREATE TABLE IF NOT EXISTS public.media_generation_providers (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  media_types TEXT[] NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  cost_per_unit NUMERIC,
  quality_rating INTEGER,
  avg_generation_time_seconds INTEGER,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.media_generation_providers ENABLE ROW LEVEL SECURITY;

-- Table: media_assets
CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  logical_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  media_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  style TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  seed TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'courses'::text,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes INTEGER,
  dimensions JSONB,
  duration_seconds NUMERIC,
  cost_usd NUMERIC,
  status TEXT NOT NULL DEFAULT 'active'::text,
  moderation_status TEXT,
  moderation_flags JSONB,
  alt_text TEXT,
  caption TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  organization_id UUID REFERENCES organizations(id),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  embedding vector(1536),
  PRIMARY KEY (id),
  UNIQUE (logical_id, version)
);
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Table: content_embeddings
CREATE TABLE IF NOT EXISTS public.content_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  content_text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.content_embeddings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS content_embeddings_embedding_idx ON content_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Table: media_assets_search
CREATE TABLE IF NOT EXISTS public.media_assets_search (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  tags TEXT[],
  alt_text TEXT,
  uploaded_by UUID,
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.media_assets_search ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS media_assets_search_embedding_idx ON media_assets_search USING ivfflat (embedding vector_cosine_ops);

-- Table: study_text_generation_jobs
CREATE TABLE IF NOT EXISTS public.study_text_generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  context JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  result_text TEXT,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  last_heartbeat TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
ALTER TABLE public.study_text_generation_jobs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 6: MESSAGING, ACHIEVEMENTS, PARENT-CHILD
-- ============================================

-- Table: messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Table: student_achievements
CREATE TABLE IF NOT EXISTS public.student_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  earned_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;

-- Table: parent_children
CREATE TABLE IF NOT EXISTS public.parent_children (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'::text,
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (parent_id, child_id)
);
ALTER TABLE public.parent_children ENABLE ROW LEVEL SECURITY;

-- Table: child_codes
CREATE TABLE IF NOT EXISTS public.child_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + '30 days'::interval),
  used BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (id)
);
ALTER TABLE public.child_codes ENABLE ROW LEVEL SECURITY;

-- Table: pending_invites
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + '7 days'::interval),
  accepted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (org_id, class_id, email)
);
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Table: events
CREATE TABLE IF NOT EXISTS public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  session_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 7: VIEWS
-- ============================================

-- View: parent_child_details
CREATE OR REPLACE VIEW public.parent_child_details AS
SELECT 
  pc.parent_id,
  pc.child_id AS student_id,
  p.full_name AS student_name,
  pc.status AS link_status,
  pc.linked_at,
  NULL::timestamp with time zone AS last_login_at,
  0::integer AS xp_total,
  0::integer AS streak_days,
  0::bigint AS recent_activity_count,
  0::bigint AS upcoming_assignments_count,
  0::bigint AS overdue_assignments_count,
  0::bigint AS goals_behind_count
FROM parent_children pc
LEFT JOIN profiles p ON p.id = pc.child_id;

-- View: round_attempts
CREATE OR REPLACE VIEW public.round_attempts AS
SELECT 
  r.id AS round_id,
  s.user_id AS student_id,
  s.course_id,
  s.assignment_id,
  r.level,
  r.content_version,
  r.started_at,
  r.ended_at,
  r.base_score,
  r.final_score,
  r.mistakes,
  r.distinct_items,
  r.elapsed_seconds,
  CASE 
    WHEN r.distinct_items > 0 THEN (r.base_score::numeric / r.distinct_items) * 100
    ELSE 0
  END AS score_pct
FROM game_rounds r
JOIN game_sessions s ON s.id = r.session_id;
