-- ============================================
-- LEARNPLAY PLATFORM - COMPLETE DATABASE SETUP
-- ============================================
-- This script creates the complete database schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- ============================================
-- PART 1: EXTENSIONS AND SEQUENCES
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create catalog version counter sequence
CREATE SEQUENCE IF NOT EXISTS public.catalog_version_seq START 1;

-- ============================================
-- PART 2: CORE TABLES
-- ============================================

-- Table: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student'::text,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Table: organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  branding JSONB DEFAULT '{}'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Table: organization_users
CREATE TABLE IF NOT EXISTS public.organization_users (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_role TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

-- Table: organization_domains
CREATE TABLE IF NOT EXISTS public.organization_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  is_primary BOOLEAN DEFAULT false,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY;

-- Table: classes
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Table: class_members
CREATE TABLE IF NOT EXISTS public.class_members (
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY (class_id, user_id)
);
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;

-- Table: class_join_codes
CREATE TABLE IF NOT EXISTS public.class_join_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + '90 days'::interval),
  is_active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (id)
);
ALTER TABLE public.class_join_codes ENABLE ROW LEVEL SECURITY;

-- Table: user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (user_id, organization_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 3: COURSE MANAGEMENT
-- ============================================

-- Table: course_metadata
CREATE TABLE IF NOT EXISTS public.course_metadata (
  id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tags JSONB DEFAULT '{}'::jsonb,
  tag_ids UUID[] DEFAULT '{}'::uuid[],
  visibility TEXT NOT NULL DEFAULT 'org'::text,
  etag INTEGER NOT NULL DEFAULT 1,
  content_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id, organization_id)
);
ALTER TABLE public.course_metadata ENABLE ROW LEVEL SECURITY;

-- Table: course_versions
CREATE TABLE IF NOT EXISTS public.course_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  metadata_snapshot JSONB,
  published_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  change_summary TEXT,
  PRIMARY KEY (id),
  UNIQUE (course_id, version)
);
ALTER TABLE public.course_versions ENABLE ROW LEVEL SECURITY;

-- Table: tag_types
CREATE TABLE IF NOT EXISTS public.tag_types (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (key, organization_id)
);
ALTER TABLE public.tag_types ENABLE ROW LEVEL SECURITY;

-- Table: tags
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  type_key TEXT NOT NULL,
  value TEXT NOT NULL,
  slug TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (id),
  UNIQUE (type_key, slug, organization_id)
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Table: course_tag_map
CREATE TABLE IF NOT EXISTS public.course_tag_map (
  course_id TEXT,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE
);
ALTER TABLE public.course_tag_map ENABLE ROW LEVEL SECURITY;

-- Table: catalog_updates
CREATE TABLE IF NOT EXISTS public.catalog_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  catalog_version INTEGER NOT NULL,
  course_id TEXT NOT NULL,
  action TEXT NOT NULL,
  course_title TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.catalog_updates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 4: ASSIGNMENTS AND GAMEPLAY
-- ============================================

-- Table: assignments
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  course_id TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  due_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Table: assignment_assignees
CREATE TABLE IF NOT EXISTS public.assignment_assignees (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  assignee_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (id),
  CHECK (
    (assignee_type = 'student' AND user_id IS NOT NULL AND class_id IS NULL) OR
    (assignee_type = 'class' AND class_id IS NOT NULL AND user_id IS NULL)
  )
);
ALTER TABLE public.assignment_assignees ENABLE ROW LEVEL SECURITY;

-- Table: game_sessions
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  course_id TEXT NOT NULL,
  assignment_id UUID REFERENCES assignments(id),
  content_version TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Table: game_rounds
CREATE TABLE IF NOT EXISTS public.game_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  base_score INTEGER NOT NULL DEFAULT 0,
  final_score INTEGER,
  mistakes INTEGER NOT NULL DEFAULT 0,
  distinct_items INTEGER NOT NULL DEFAULT 0,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  content_version TEXT NOT NULL DEFAULT 'legacy'::text,
  share_enabled BOOLEAN NOT NULL DEFAULT false,
  share_token TEXT UNIQUE,
  share_expires_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;

-- Table: game_attempts
CREATE TABLE IF NOT EXISTS public.game_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  item_key TEXT NOT NULL DEFAULT '0:unknown:1'::text,
  selected_index INTEGER NOT NULL,
  correct BOOLEAN NOT NULL,
  latency_ms INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.game_attempts ENABLE ROW LEVEL SECURITY;

-- Table: round_questions
CREATE TABLE IF NOT EXISTS public.round_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
  attempt_id UUID,
  question_id INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option INTEGER NOT NULL,
  student_choice INTEGER,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  difficulty TEXT,
  topic TEXT,
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.round_questions ENABLE ROW LEVEL SECURITY;

-- Table: play_sessions
CREATE TABLE IF NOT EXISTS public.play_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  assignment_id UUID REFERENCES assignments(id),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.play_sessions ENABLE ROW LEVEL SECURITY;

-- Continue in next message due to length...
