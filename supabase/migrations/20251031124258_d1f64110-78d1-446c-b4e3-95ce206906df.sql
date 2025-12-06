-- Create round_questions table to store detailed question data for each attempt
CREATE TABLE IF NOT EXISTS public.round_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.game_rounds(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.game_attempts(id) ON DELETE SET NULL,
  question_id integer NOT NULL,
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_option integer NOT NULL,
  student_choice integer,
  is_correct boolean NOT NULL DEFAULT false,
  explanation text,
  topic text,
  difficulty text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(round_id, question_id)
);

-- Create index for faster queries
CREATE INDEX idx_round_questions_round_id ON public.round_questions(round_id);
CREATE INDEX idx_round_questions_topic ON public.round_questions(topic);

-- Create view for round_attempts (combines game_rounds with session data)
CREATE OR REPLACE VIEW public.round_attempts AS
SELECT 
  r.id as round_id,
  s.user_id as student_id,
  s.course_id,
  s.assignment_id,
  r.level,
  r.content_version,
  r.started_at,
  r.ended_at,
  r.final_score,
  r.base_score,
  r.mistakes,
  r.elapsed_seconds,
  r.distinct_items,
  CASE 
    WHEN r.final_score IS NOT NULL AND r.final_score + r.mistakes > 0 
    THEN ROUND((r.final_score::numeric / (r.final_score + r.mistakes)) * 100, 2)
    ELSE 0 
  END as score_pct
FROM public.game_rounds r
JOIN public.game_sessions s ON s.id = r.session_id;

-- Enable RLS on round_questions
ALTER TABLE public.round_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for round_questions

-- Students can view their own round questions
CREATE POLICY "students_view_own_round_questions"
ON public.round_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.game_rounds r
    JOIN public.game_sessions s ON s.id = r.session_id
    WHERE r.id = round_questions.round_id
      AND s.user_id = auth.uid()
  )
);

-- Parents can view their children's round questions
CREATE POLICY "parents_view_children_round_questions"
ON public.round_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.game_rounds r
    JOIN public.game_sessions s ON s.id = r.session_id
    JOIN public.parent_children pc ON pc.child_id = s.user_id
    WHERE r.id = round_questions.round_id
      AND pc.parent_id = auth.uid()
      AND pc.status = 'active'
  )
);

-- Teachers can view round questions from students in their org
CREATE POLICY "teachers_view_org_round_questions"
ON public.round_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.game_rounds r
    JOIN public.game_sessions s ON s.id = r.session_id
    JOIN public.organization_users ou1 ON ou1.user_id = auth.uid()
    JOIN public.organization_users ou2 ON ou2.user_id = s.user_id
    WHERE r.id = round_questions.round_id
      AND ou1.org_id = ou2.org_id
      AND ou1.org_role IN ('teacher', 'school_admin')
  )
);

-- Students can insert their own round questions
CREATE POLICY "students_insert_own_round_questions"
ON public.round_questions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.game_rounds r
    JOIN public.game_sessions s ON s.id = r.session_id
    WHERE r.id = round_questions.round_id
      AND s.user_id = auth.uid()
  )
);

-- Add shareable token support to game_rounds
ALTER TABLE public.game_rounds 
ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS share_expires_at timestamp with time zone;

-- Create index for share token lookups
CREATE INDEX IF NOT EXISTS idx_game_rounds_share_token ON public.game_rounds(share_token) WHERE share_enabled = true;

-- Public access policy for shared rounds (via token)
CREATE POLICY "public_view_shared_rounds"
ON public.game_rounds
FOR SELECT
TO public
USING (
  share_enabled = true 
  AND share_token IS NOT NULL 
  AND (share_expires_at IS NULL OR share_expires_at > now())
);

-- Public access policy for shared round questions (via token)
CREATE POLICY "public_view_shared_round_questions"
ON public.round_questions
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.game_rounds r
    WHERE r.id = round_questions.round_id
      AND r.share_enabled = true
      AND r.share_token IS NOT NULL
      AND (r.share_expires_at IS NULL OR r.share_expires_at > now())
  )
);