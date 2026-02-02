-- Alerts table for job health monitoring
-- Idempotent, no secrets.

CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  alert_key text NOT NULL UNIQUE,
  type text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_severity_check;
ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_severity_check
  CHECK (severity IN ('info', 'warning', 'critical'));

CREATE INDEX IF NOT EXISTS idx_alerts_active ON public.alerts(resolved_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON public.alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_org ON public.alerts(organization_id);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS alerts_set_updated_at ON public.alerts;
CREATE TRIGGER alerts_set_updated_at
BEFORE UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS and org isolation for read access
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alerts_org_isolation ON public.alerts;
CREATE POLICY alerts_org_isolation
  ON public.alerts
  FOR SELECT
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
