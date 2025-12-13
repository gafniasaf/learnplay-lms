-- Fix: Ensure public.user_roles exists (Lovable runtime depends on it via get-user-roles Edge Function)
-- This migration is intentionally minimal + idempotent to avoid unintended drift.

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'org_admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- Helpful indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON public.user_roles(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_superadmin ON public.user_roles(user_id) WHERE organization_id IS NULL AND role = 'superadmin';

-- Permissions + RLS (read-only for the current user by default)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop-and-create pattern is avoided; only create if missing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Users can read their own roles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users can read their own roles"
        ON public.user_roles
        FOR SELECT
        USING (user_id = auth.uid());
    $policy$;
  END IF;
END $$;

-- Ensure authenticated users can select (RLS still applies)
GRANT SELECT ON TABLE public.user_roles TO authenticated;


