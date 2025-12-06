-- Create student_activity_log table
CREATE TABLE public.student_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'assignment_completed',
    'badge_earned',
    'joined_class',
    'level_up',
    'streak_milestone',
    'course_started',
    'perfect_score',
    'login'
  )),
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_activity_log ENABLE ROW LEVEL SECURITY;

-- Index for efficient pagination (critical for performance)
CREATE INDEX idx_student_activity_log_pagination 
  ON public.student_activity_log(student_id, occurred_at DESC);

-- Index for event type filtering
CREATE INDEX idx_student_activity_log_event_type 
  ON public.student_activity_log(event_type);

-- RLS Policy: Students view own activity
CREATE POLICY "students view own activity"
ON public.student_activity_log
FOR SELECT
USING (auth.uid() = student_id);

-- RLS Policy: Students insert own activity
CREATE POLICY "students insert own activity"
ON public.student_activity_log
FOR INSERT
WITH CHECK (auth.uid() = student_id);

-- RLS Policy: Parents view linked children's activity
CREATE POLICY "parents view children activity"
ON public.student_activity_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM parent_children pc
    WHERE pc.parent_id = auth.uid()
      AND pc.child_id = student_activity_log.student_id
  )
);

-- RLS Policy: Teachers view org students' activity
CREATE POLICY "teachers view org student activity"
ON public.student_activity_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou1
    JOIN organization_users ou2 ON ou1.org_id = ou2.org_id
    WHERE ou1.user_id = auth.uid()
      AND ou1.org_role IN ('teacher', 'school_admin')
      AND ou2.user_id = student_activity_log.student_id
  )
);