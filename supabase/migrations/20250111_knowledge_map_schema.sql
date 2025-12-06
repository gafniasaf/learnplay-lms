-- =====================================================
-- Knowledge Map System Database Schema
-- Version: 1.0
-- Status: PREPARED (not executed yet - for review)
-- =====================================================

-- =====================================================
-- 1. TOPICS (Domain Organization)
-- =====================================================
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,                    -- e.g., "math.algebra", "reading.comprehension"
  name TEXT NOT NULL,                     -- e.g., "Algebra", "Reading Comprehension"
  domain TEXT NOT NULL,                   -- e.g., "math", "reading", "science"
  display_order INT DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_topics_domain ON topics(domain);

-- =====================================================
-- 2. KNOWLEDGE OBJECTIVES (Core KO Table)
-- =====================================================
CREATE TABLE IF NOT EXISTS knowledge_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  domain TEXT NOT NULL,                   -- "math", "reading", "science"
  topic_cluster_id TEXT REFERENCES topics(id),
  
  -- Prerequisite graph (array of KO IDs)
  prerequisites UUID[] DEFAULT '{}',
  
  -- Examples for display
  examples JSONB DEFAULT '[]',            -- [{ problem: "...", solution: "..." }]
  
  -- Metadata
  difficulty NUMERIC,                     -- 0-1 scale (LLM-estimated)
  level_score NUMERIC,                    -- 0-100 scale (LLM-assigned for white-label mapping)
  
  -- Lifecycle
  status TEXT DEFAULT 'published',        -- 'draft', 'published', 'archived'
  alias_of UUID REFERENCES knowledge_objectives(id),  -- For merged KOs
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,                        -- Optional: track who created (admin/llm)
  
  CONSTRAINT valid_status CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX idx_ko_domain ON knowledge_objectives(domain);
CREATE INDEX idx_ko_topic_cluster ON knowledge_objectives(topic_cluster_id);
CREATE INDEX idx_ko_status ON knowledge_objectives(status);
CREATE INDEX idx_ko_alias ON knowledge_objectives(alias_of) WHERE alias_of IS NOT NULL;

-- GIN index for prerequisite array searches
CREATE INDEX idx_ko_prerequisites ON knowledge_objectives USING GIN(prerequisites);

-- =====================================================
-- 3. MASTERY STATE (Student Progress)
-- =====================================================
CREATE TABLE IF NOT EXISTS mastery_state (
  student_id UUID NOT NULL,
  ko_id UUID NOT NULL REFERENCES knowledge_objectives(id) ON DELETE CASCADE,
  
  -- Mastery tracking
  mastery NUMERIC DEFAULT 0.5,            -- 0-1 scale
  evidence_count INT DEFAULT 0,           -- Number of attempts/exercises
  
  -- Timestamps
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  first_practiced TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (student_id, ko_id)
);

CREATE INDEX idx_mastery_student ON mastery_state(student_id);
CREATE INDEX idx_mastery_ko ON mastery_state(ko_id);
CREATE INDEX idx_mastery_last_updated ON mastery_state(student_id, last_updated DESC);

-- Partial index for low-mastery students (for intervention queries)
CREATE INDEX idx_mastery_low ON mastery_state(student_id, ko_id) 
  WHERE mastery < 0.5;

-- =====================================================
-- 4. EXERCISE-KO MAPPINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS exercise_ko_mappings (
  exercise_id TEXT NOT NULL,              -- Format: "courseId:itemId"
  ko_id UUID NOT NULL REFERENCES knowledge_objectives(id) ON DELETE CASCADE,
  
  -- Mapping metadata
  weight NUMERIC NOT NULL DEFAULT 1.0,    -- 0-1, weights per exercise should sum to ~1
  confidence NUMERIC,                     -- LLM confidence in this mapping (0-1)
  source TEXT DEFAULT 'manual',           -- 'manual', 'llm', 'llm_verified'
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  
  PRIMARY KEY (exercise_id, ko_id),
  CONSTRAINT valid_weight CHECK (weight >= 0 AND weight <= 1),
  CONSTRAINT valid_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE INDEX idx_mapping_ko ON exercise_ko_mappings(ko_id);
CREATE INDEX idx_mapping_exercise ON exercise_ko_mappings(exercise_id);
CREATE INDEX idx_mapping_source ON exercise_ko_mappings(source);

-- =====================================================
-- 5. COURSE-KO SCOPE (Course Relevance)
-- =====================================================
CREATE TABLE IF NOT EXISTS course_ko_scope (
  course_id TEXT NOT NULL,
  ko_id UUID NOT NULL REFERENCES knowledge_objectives(id) ON DELETE CASCADE,
  
  -- Relevance metadata
  relevance NUMERIC DEFAULT 1.0,          -- How central this KO is to the course (0-1)
  exercise_count INT DEFAULT 0,           -- Cached count of exercises for this KO in this course
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (course_id, ko_id),
  CONSTRAINT valid_relevance CHECK (relevance >= 0 AND relevance <= 1)
);

CREATE INDEX idx_course_scope_ko ON course_ko_scope(ko_id);
CREATE INDEX idx_course_scope_course ON course_ko_scope(course_id);

-- =====================================================
-- 6. STUDENT KO PREFERENCES (Assignments & Overrides)
-- =====================================================
CREATE TABLE IF NOT EXISTS student_ko_preferences (
  student_id UUID NOT NULL,
  ko_id UUID NOT NULL REFERENCES knowledge_objectives(id) ON DELETE CASCADE,
  
  -- Assignment context
  priority TEXT NOT NULL,                 -- 'focus', 'skip', 'review'
  source TEXT NOT NULL,                   -- 'teacher_assignment', 'parent_assignment', 'self'
  set_by UUID,                            -- Teacher or parent user ID
  
  -- Assignment details
  assignment_id UUID,                     -- Link to assignments table (if applicable)
  course_id TEXT,                         -- Pre-selected course from recommendation
  
  -- Progress tracking
  progress_current INT DEFAULT 0,         -- Exercises completed
  progress_target INT,                    -- Target exercises or mastery threshold
  
  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                 -- Auto-expire assignments
  superseded_by UUID,                     -- If overridden by teacher
  
  PRIMARY KEY (student_id, ko_id),
  CONSTRAINT valid_priority CHECK (priority IN ('focus', 'skip', 'review')),
  CONSTRAINT valid_source CHECK (source IN ('teacher_assignment', 'parent_assignment', 'self'))
);

CREATE INDEX idx_prefs_student ON student_ko_preferences(student_id);
CREATE INDEX idx_prefs_ko ON student_ko_preferences(ko_id);
CREATE INDEX idx_prefs_assignment ON student_ko_preferences(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX idx_prefs_expires ON student_ko_preferences(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- 7. ASSIGNMENTS (Detailed Assignment Records)
-- =====================================================
CREATE TABLE IF NOT EXISTS ko_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Assignment basics
  student_id UUID NOT NULL,
  ko_id UUID NOT NULL REFERENCES knowledge_objectives(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  
  -- Assignment metadata
  assigned_by UUID NOT NULL,              -- Teacher or parent user ID
  assigned_by_role TEXT NOT NULL,         -- 'teacher', 'parent', 'ai_autonomous'
  
  -- Completion criteria (JSONB for flexibility)
  completion_criteria JSONB NOT NULL DEFAULT '{
    "primary_kpi": "mastery_score",
    "target_mastery": 0.75,
    "min_evidence": 5
  }',
  
  -- AI context (if AI-recommended)
  llm_rationale TEXT,                     -- Why AI picked this course
  llm_confidence NUMERIC,                 -- 0-1
  
  -- Status tracking
  status TEXT DEFAULT 'active',           -- 'active', 'completed', 'overdue', 'cancelled'
  completed_at TIMESTAMPTZ,
  completion_reason TEXT,                 -- 'mastery_achieved', 'exercises_completed', 'deadline_exceeded'
  final_mastery NUMERIC,
  
  -- Dates
  created_at TIMESTAMPTZ DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  
  CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'overdue', 'cancelled')),
  CONSTRAINT valid_role CHECK (assigned_by_role IN ('teacher', 'parent', 'ai_autonomous'))
);

CREATE INDEX idx_assignments_student ON ko_assignments(student_id);
CREATE INDEX idx_assignments_ko ON ko_assignments(ko_id);
CREATE INDEX idx_assignments_status ON ko_assignments(status);
CREATE INDEX idx_assignments_due ON ko_assignments(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_assignments_assigned_by ON ko_assignments(assigned_by);

-- =====================================================
-- 8. AUTO-ASSIGN SETTINGS (Per Student)
-- =====================================================
CREATE TABLE IF NOT EXISTS auto_assign_settings (
  student_id UUID PRIMARY KEY,
  
  -- Settings
  enabled BOOLEAN DEFAULT FALSE,
  mastery_threshold NUMERIC DEFAULT 0.70, -- Auto-assign if mastery < threshold
  frequency TEXT DEFAULT 'weekly',        -- 'daily', 'weekly', 'on_completion'
  max_concurrent INT DEFAULT 3,           -- Max concurrent assignments
  
  -- Notifications
  notify_on_assign BOOLEAN DEFAULT TRUE,
  notify_email TEXT,                      -- Override email for notifications
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_frequency CHECK (frequency IN ('daily', 'weekly', 'on_completion'))
);

CREATE INDEX idx_auto_assign_enabled ON auto_assign_settings(enabled) WHERE enabled = TRUE;

-- =====================================================
-- 9. KO MERGE PROPOSALS (Deduplication Queue)
-- =====================================================
CREATE TABLE IF NOT EXISTS ko_merge_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  ko_a UUID NOT NULL REFERENCES knowledge_objectives(id) ON DELETE CASCADE,
  ko_b UUID NOT NULL REFERENCES knowledge_objectives(id) ON DELETE CASCADE,
  
  -- Similarity metadata
  similarity NUMERIC NOT NULL,            -- 0-1 (from vector embeddings)
  llm_reasoning TEXT,                     -- LLM explanation of equivalence
  
  -- Review status
  status TEXT DEFAULT 'pending',          -- 'pending', 'approved', 'rejected'
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT different_kos CHECK (ko_a != ko_b),
  CONSTRAINT valid_similarity CHECK (similarity >= 0 AND similarity <= 1),
  CONSTRAINT valid_merge_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_merge_proposals_status ON ko_merge_proposals(status);
CREATE INDEX idx_merge_proposals_similarity ON ko_merge_proposals(similarity DESC);

-- =====================================================
-- HELPER FUNCTIONS & TRIGGERS
-- =====================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_topics_updated_at BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ko_updated_at BEFORE UPDATE ON knowledge_objectives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_scope_updated_at BEFORE UPDATE ON course_ko_scope
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auto_assign_updated_at BEFORE UPDATE ON auto_assign_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MATERIALIZED VIEW: Class KO Summary (Teacher Dashboard)
-- =====================================================
-- NOTE: This is prepared but commented out for initial setup
-- Uncomment and REFRESH after data is populated

/*
CREATE MATERIALIZED VIEW class_ko_summary AS
SELECT 
  c.id AS class_id,
  c.name AS class_name,
  ko.id AS ko_id,
  ko.name AS ko_name,
  ko.domain,
  ko.topic_cluster_id,
  COUNT(DISTINCT ms.student_id) AS total_students,
  COUNT(DISTINCT ms.student_id) FILTER (WHERE ms.mastery < 0.5) AS struggling_count,
  AVG(ms.mastery) AS avg_mastery,
  MAX(ms.last_updated) AS last_practiced
FROM classes c
JOIN class_enrollments ce ON ce.class_id = c.id
JOIN mastery_state ms ON ms.student_id = ce.student_id
JOIN knowledge_objectives ko ON ko.id = ms.ko_id
WHERE ko.status = 'published'
GROUP BY c.id, c.name, ko.id, ko.name, ko.domain, ko.topic_cluster_id;

CREATE INDEX idx_class_ko_summary_class ON class_ko_summary(class_id);
CREATE INDEX idx_class_ko_summary_ko ON class_ko_summary(ko_id);
CREATE INDEX idx_class_ko_summary_struggling ON class_ko_summary(struggling_count DESC);

-- Refresh nightly or on-demand:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY class_ko_summary;
*/

-- =====================================================
-- SAMPLE DATA GENERATION HELPER
-- =====================================================
-- Use this to generate mock data for testing
-- Run with: SELECT generate_mock_knowledge_data();

CREATE OR REPLACE FUNCTION generate_mock_knowledge_data()
RETURNS TEXT AS $$
DECLARE
  topic_math_algebra TEXT := 'math.algebra';
  topic_math_fractions TEXT := 'math.fractions';
  topic_reading_comp TEXT := 'reading.comprehension';
  ko_id_1 UUID;
  ko_id_2 UUID;
BEGIN
  -- Insert topics
  INSERT INTO topics (id, name, domain, display_order) VALUES
    (topic_math_algebra, 'Algebra', 'math', 1),
    (topic_math_fractions, 'Fractions', 'math', 2),
    (topic_reading_comp, 'Comprehension', 'reading', 1)
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert sample KOs
  INSERT INTO knowledge_objectives (id, name, description, domain, topic_cluster_id, difficulty, level_score, status)
  VALUES
    (gen_random_uuid(), 'Two-step linear equations', 'Solve equations of the form ax + b = c', 'math', topic_math_algebra, 0.45, 35, 'published'),
    (gen_random_uuid(), 'Variables on both sides', 'Solve equations with variables on both sides', 'math', topic_math_algebra, 0.62, 42, 'published'),
    (gen_random_uuid(), 'Fraction to decimal conversion', 'Convert fractions to decimals', 'math', topic_math_fractions, 0.35, 28, 'published'),
    (gen_random_uuid(), 'Inference from text', 'Draw logical inferences from narrative passages', 'reading', topic_reading_comp, 0.52, 38, 'published')
  RETURNING id INTO ko_id_1;
  
  RETURN 'Mock data generated successfully';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- NOTES FOR PRODUCTION DEPLOYMENT
-- =====================================================
-- 1. Run this migration file when ready to deploy
-- 2. Set up RLS policies per your existing auth model
-- 3. Grant appropriate permissions to service role
-- 4. Uncomment and refresh materialized view after data load
-- 5. Set up nightly cron job to refresh materialized view
-- 6. Configure pgvector extension for embeddings (separate migration)
-- 7. Add foreign key to users table for student_id, assigned_by, etc.

-- =====================================================
-- RLS POLICIES (Template - customize per your auth)
-- =====================================================
-- Enable RLS
ALTER TABLE knowledge_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastery_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_ko_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ko_assignments ENABLE ROW LEVEL SECURITY;

-- Example policy: Students can read their own mastery
-- CREATE POLICY "Students can view own mastery"
--   ON mastery_state FOR SELECT
--   USING (auth.uid() = student_id);

-- Example policy: Teachers can view their class students
-- CREATE POLICY "Teachers can view class mastery"
--   ON mastery_state FOR SELECT
--   USING (EXISTS (
--     SELECT 1 FROM class_enrollments ce
--     JOIN classes c ON c.id = ce.class_id
--     WHERE ce.student_id = mastery_state.student_id
--       AND c.teacher_id = auth.uid()
--   ));

-- TODO: Complete RLS policies based on your auth model
