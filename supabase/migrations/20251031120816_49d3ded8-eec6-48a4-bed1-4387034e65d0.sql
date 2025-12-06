-- Create student_assignments table
CREATE TABLE public.student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed', 'overdue')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  score INTEGER CHECK (score >= 0 AND score <= 100),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE SET NULL
);

-- Create student_metrics table
CREATE TABLE public.student_metrics (
  student_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  streak_days INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  xp_total INTEGER NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
  last_login_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create student_recommendations table
CREATE TABLE public.student_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for student_assignments
CREATE POLICY "students view own assignments"
ON public.student_assignments
FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "students insert own assignments"
ON public.student_assignments
FOR INSERT
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "students update own assignments"
ON public.student_assignments
FOR UPDATE
USING (auth.uid() = student_id);

CREATE POLICY "teachers view org student assignments"
ON public.student_assignments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou1
    JOIN organization_users ou2 ON ou1.org_id = ou2.org_id
    WHERE ou1.user_id = auth.uid()
      AND ou1.org_role IN ('teacher', 'school_admin')
      AND ou2.user_id = student_assignments.student_id
  )
);

-- RLS Policies for student_metrics
CREATE POLICY "students view own metrics"
ON public.student_metrics
FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "students manage own metrics"
ON public.student_metrics
FOR ALL
USING (auth.uid() = student_id);

CREATE POLICY "teachers view org student metrics"
ON public.student_metrics
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou1
    JOIN organization_users ou2 ON ou1.org_id = ou2.org_id
    WHERE ou1.user_id = auth.uid()
      AND ou1.org_role IN ('teacher', 'school_admin')
      AND ou2.user_id = student_metrics.student_id
  )
);

-- RLS Policies for student_recommendations
CREATE POLICY "students view own recommendations"
ON public.student_recommendations
FOR SELECT
USING (auth.uid() = student_id);

CREATE POLICY "students insert own recommendations"
ON public.student_recommendations
FOR INSERT
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "teachers view org student recommendations"
ON public.student_recommendations
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou1
    JOIN organization_users ou2 ON ou1.org_id = ou2.org_id
    WHERE ou1.user_id = auth.uid()
      AND ou1.org_role IN ('teacher', 'school_admin')
      AND ou2.user_id = student_recommendations.student_id
  )
);

-- Create indexes for performance
CREATE INDEX idx_student_assignments_student_id ON public.student_assignments(student_id);
CREATE INDEX idx_student_assignments_due_at ON public.student_assignments(due_at);
CREATE INDEX idx_student_assignments_status ON public.student_assignments(status);
CREATE INDEX idx_student_recommendations_student_id ON public.student_recommendations(student_id);

-- Trigger to update updated_at
CREATE TRIGGER update_student_assignments_updated_at
  BEFORE UPDATE ON public.student_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_student_metrics_updated_at
  BEFORE UPDATE ON public.student_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();