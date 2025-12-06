-- Create events table for append-only analytics
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure idempotency
  UNIQUE(session_id, idempotency_key)
);

-- Index for efficient querying
CREATE INDEX idx_events_created_at ON public.events(created_at DESC);
CREATE INDEX idx_events_user_id ON public.events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_events_session ON public.events(session_id);
CREATE INDEX idx_events_type ON public.events(event_type);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "users insert own events"
  ON public.events
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR user_id IS NULL
  );

-- Users can read their own events
CREATE POLICY "users read own events"
  ON public.events
  FOR SELECT
  USING (
    auth.uid() = user_id OR user_id IS NULL
  );

-- Teachers and admins can read all events for their org
CREATE POLICY "teachers read org events"
  ON public.events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.user_id = auth.uid()
        AND ou.org_role IN ('teacher', 'school_admin')
        AND EXISTS (
          SELECT 1 FROM organization_users ou2
          WHERE ou2.user_id = events.user_id
            AND ou2.org_id = ou.org_id
        )
    )
  );

-- Create analytics storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('analytics', 'analytics', false)
ON CONFLICT (id) DO NOTHING;

-- Analytics bucket policies: only admins can read/write
CREATE POLICY "admins read analytics"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'analytics'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "service role writes analytics"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'analytics'
    AND auth.jwt() ->> 'role' = 'service_role'
  );