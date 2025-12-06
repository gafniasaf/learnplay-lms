-- Create play_sessions table for session recovery
CREATE TABLE public.play_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id text NOT NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  state jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.play_sessions ENABLE ROW LEVEL SECURITY;

-- Students can view their own sessions
CREATE POLICY "students_view_own_sessions"
  ON public.play_sessions
  FOR SELECT
  USING (auth.uid() = student_id);

-- Students can insert their own sessions
CREATE POLICY "students_create_own_sessions"
  ON public.play_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Students can update their own sessions
CREATE POLICY "students_update_own_sessions"
  ON public.play_sessions
  FOR UPDATE
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Students can delete their own sessions
CREATE POLICY "students_delete_own_sessions"
  ON public.play_sessions
  FOR DELETE
  USING (auth.uid() = student_id);

-- Teachers can view sessions for students in their org
CREATE POLICY "teachers_view_org_sessions"
  ON public.play_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM organization_users ou1
      JOIN organization_users ou2 ON ou1.org_id = ou2.org_id
      WHERE ou1.user_id = auth.uid()
        AND ou1.org_role IN ('teacher', 'school_admin')
        AND ou2.user_id = play_sessions.student_id
    )
  );

-- Add indexes for performance
CREATE INDEX idx_play_sessions_student_course ON public.play_sessions(student_id, course_id);
CREATE INDEX idx_play_sessions_assignment ON public.play_sessions(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX idx_play_sessions_updated ON public.play_sessions(updated_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_play_sessions_updated_at
  BEFORE UPDATE ON public.play_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.play_sessions IS 'Stores play session state for recovery and resuming gameplay';
COMMENT ON COLUMN public.play_sessions.state IS 'JSON state including current level, score, progress, items attempted, etc.';
