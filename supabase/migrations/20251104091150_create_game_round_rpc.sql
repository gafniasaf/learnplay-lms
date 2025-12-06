-- RPC to create a game round as SECURITY DEFINER (bypass RLS safely)
CREATE OR REPLACE FUNCTION public.create_game_round(
  p_session_id uuid,
  p_level integer,
  p_content_version text,
  p_user_id uuid
) RETURNS public.game_rounds
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.game_rounds(session_id, level, content_version, created_by)
  VALUES (p_session_id, p_level, COALESCE(p_content_version, 'unknown'), p_user_id)
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION public.create_game_round(uuid, integer, text, uuid)
TO authenticated, service_role;
