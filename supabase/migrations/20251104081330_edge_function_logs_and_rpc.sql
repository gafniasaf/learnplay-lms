-- Edge function logging infrastructure
-- Creates table, indexes, RLS policies, and secure RPC for inserts

-- 1) Table
CREATE TABLE IF NOT EXISTS public.edge_function_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  request_id text,
  level text NOT NULL CHECK (level IN ('info','warn','error','debug')),
  message text NOT NULL,
  metadata jsonb,
  user_id uuid REFERENCES auth.users(id),
  job_id uuid,
  duration_ms integer,
  error_code text,
  stack_trace text
);

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_created_at ON public.edge_function_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_function_name ON public.edge_function_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_level ON public.edge_function_logs(level);
CREATE INDEX IF NOT EXISTS idx_edge_function_logs_job_id ON public.edge_function_logs(job_id) WHERE job_id IS NOT NULL;

-- 3) RLS
ALTER TABLE public.edge_function_logs ENABLE ROW LEVEL SECURITY;

-- Allow service_role to insert/read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='edge_function_logs' AND policyname='Service role can insert logs'
  ) THEN
    CREATE POLICY "Service role can insert logs"
      ON public.edge_function_logs
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='edge_function_logs' AND policyname='Service role can read logs'
  ) THEN
    CREATE POLICY "Service role can read logs"
      ON public.edge_function_logs
      FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;

-- Allow authenticated users to read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='edge_function_logs' AND policyname='Authenticated users can view logs'
  ) THEN
    CREATE POLICY "Authenticated users can view logs"
      ON public.edge_function_logs
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 4) Secure RPC for inserts (preferred from edge functions)
CREATE OR REPLACE FUNCTION public.log_edge_event(
  p_function_name text,
  p_level text,
  p_message text,
  p_request_id text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,
  p_stack_trace text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.edge_function_logs(
    function_name, level, message, request_id, user_id, job_id,
    duration_ms, error_code, metadata, stack_trace
  ) VALUES (
    p_function_name, p_level, p_message, p_request_id, p_user_id, p_job_id,
    p_duration_ms, p_error_code, p_metadata, p_stack_trace
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_edge_event(text, text, text, text, uuid, uuid, integer, text, jsonb, text) TO service_role;
