-- Create student_achievements table
CREATE TABLE public.student_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('earned', 'in_progress', 'locked')),
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  earned_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, badge_code)
);

-- Create student_goals table
CREATE TABLE public.student_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_minutes INTEGER NOT NULL CHECK (target_minutes > 0),
  progress_minutes INTEGER NOT NULL DEFAULT 0 CHECK (progress_minutes >= 0),
  due_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track', 'behind', 'completed')),
  teacher_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_goals ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_student_achievements_student_id ON public.student_achievements(student_id);
CREATE INDEX idx_student_achievements_status ON public.student_achievements(status);
CREATE INDEX idx_student_goals_student_id ON public.student_goals(student_id);
CREATE INDEX idx_student_goals_status ON public.student_goals(status);
CREATE INDEX idx_student_goals_due_at ON public.student_goals(due_at);

-- RLS Policies for student_achievements

-- Students view own achievements
CREATE POLICY "students view own achievements"
ON public.student_achievements
FOR SELECT
USING (auth.uid() = student_id);

-- Students manage own achievements
CREATE POLICY "students manage own achievements"
ON public.student_achievements
FOR ALL
USING (auth.uid() = student_id);

-- Parents view linked children's achievements
CREATE POLICY "parents view children achievements"
ON public.student_achievements
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM parent_children pc
    WHERE pc.parent_id = auth.uid()
      AND pc.child_id = student_achievements.student_id
  )
);

-- Teachers view org students' achievements
CREATE POLICY "teachers view org student achievements"
ON public.student_achievements
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou1
    JOIN organization_users ou2 ON ou1.org_id = ou2.org_id
    WHERE ou1.user_id = auth.uid()
      AND ou1.org_role IN ('teacher', 'school_admin')
      AND ou2.user_id = student_achievements.student_id
  )
);

-- RLS Policies for student_goals

-- Students view own goals
CREATE POLICY "students view own goals"
ON public.student_goals
FOR SELECT
USING (auth.uid() = student_id);

-- Students update own progress (not status/teacher_note)
CREATE POLICY "students update own goal progress"
ON public.student_goals
FOR UPDATE
USING (auth.uid() = student_id);

-- Parents view linked children's goals
CREATE POLICY "parents view children goals"
ON public.student_goals
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM parent_children pc
    WHERE pc.parent_id = auth.uid()
      AND pc.child_id = student_goals.student_id
  )
);

-- Teachers view org students' goals
CREATE POLICY "teachers view org student goals"
ON public.student_goals
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou1
    JOIN organization_users ou2 ON ou1.org_id = ou2.org_id
    WHERE ou1.user_id = auth.uid()
      AND ou1.org_role IN ('teacher', 'school_admin')
      AND ou2.user_id = student_goals.student_id
  )
);

-- Teachers manage org students' goals
CREATE POLICY "teachers manage org student goals"
ON public.student_goals
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM organization_users ou1
    JOIN organization_users ou2 ON ou1.org_id = ou2.org_id
    WHERE ou1.user_id = auth.uid()
      AND ou1.org_role IN ('teacher', 'school_admin')
      AND ou2.user_id = student_goals.student_id
  )
);

-- Triggers to update updated_at
CREATE TRIGGER update_student_achievements_updated_at
  BEFORE UPDATE ON public.student_achievements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_student_goals_updated_at
  BEFORE UPDATE ON public.student_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();