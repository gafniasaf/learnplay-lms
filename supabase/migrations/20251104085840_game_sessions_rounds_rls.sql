-- RLS fixes for game sessions and rounds
-- Ensures authenticated users can create/use their own sessions/rounds
-- and edge functions (service_role) bypass RLS entirely

-- =============================
-- game_sessions
-- =============================
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS created_by uuid;

-- Backfill existing rows (created_by <- user_id when missing)
UPDATE public.game_sessions
SET created_by = COALESCE(created_by, user_id)
WHERE created_by IS NULL;

-- Default created_by from auth.uid() on insert
CREATE OR REPLACE FUNCTION public.set_game_session_created_by()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_game_sessions_set_created_by ON public.game_sessions;
CREATE TRIGGER trg_game_sessions_set_created_by
BEFORE INSERT ON public.game_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_game_session_created_by();

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Recreate policies
DROP POLICY IF EXISTS "game_sessions_insert_own"  ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions_select_own"  ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions_update_own"  ON public.game_sessions;
DROP POLICY IF EXISTS "game_sessions_sr_all"      ON public.game_sessions;

CREATE POLICY "game_sessions_insert_own"
  ON public.game_sessions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "game_sessions_select_own"
  ON public.game_sessions FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR user_id = auth.uid());

CREATE POLICY "game_sessions_update_own"
  ON public.game_sessions FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR user_id = auth.uid());

CREATE POLICY "game_sessions_sr_all"
  ON public.game_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- =============================
-- game_rounds
-- =============================
ALTER TABLE public.game_rounds ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE OR REPLACE FUNCTION public.set_round_created_by()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rounds_set_created_by ON public.game_rounds;
CREATE TRIGGER trg_rounds_set_created_by
BEFORE INSERT ON public.game_rounds
FOR EACH ROW EXECUTE FUNCTION public.set_round_created_by();

ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;

-- Drop/replace policies
DROP POLICY IF EXISTS "rounds_insert_own_session" ON public.game_rounds;
DROP POLICY IF EXISTS "rounds_select_own_session" ON public.game_rounds;
DROP POLICY IF EXISTS "rounds_update_own_session" ON public.game_rounds;
DROP POLICY IF EXISTS "rounds_sr_all"             ON public.game_rounds;

-- Authenticated users: may insert a round when the referenced session belongs to them
CREATE POLICY "rounds_insert_own_session"
ON public.game_rounds FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.game_sessions s
    WHERE s.id = session_id
      AND (s.created_by = auth.uid() OR s.user_id = auth.uid())
  )
);

-- Authenticated users: may read their rounds or rounds under their sessions
CREATE POLICY "rounds_select_own_session"
ON public.game_rounds FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.game_sessions s
    WHERE s.id = public.game_rounds.session_id
      AND (s.created_by = auth.uid() OR s.user_id = auth.uid())
  )
);

-- Authenticated users: may update their rounds
CREATE POLICY "rounds_update_own_session"
ON public.game_rounds FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.game_sessions s
    WHERE s.id = public.game_rounds.session_id
      AND (s.created_by = auth.uid() OR s.user_id = auth.uid())
  )
);

-- Edge functions bypass
CREATE POLICY "rounds_sr_all"
ON public.game_rounds FOR ALL TO service_role
USING (true) WITH CHECK (true);
