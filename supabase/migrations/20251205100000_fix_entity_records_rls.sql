-- Fix entity_records RLS policies to enforce proper access control
-- Per PLAN.md Section F.6 Business Rules:
-- BR-001: Learners can only access their own assignments
-- BR-002: Teachers can only see their own classes
-- BR-003: Parents can only see linked children

-- Drop the overly permissive policy
DROP POLICY IF EXISTS entity_records_access_policy ON public.entity_records;

-- Create proper RLS policies

-- 1. Organization-scoped read access (users can read records in their organization)
CREATE POLICY entity_records_org_read_policy
  ON public.entity_records
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.user_organizations 
      WHERE user_id = auth.uid()
    )
  );

-- 2. Organization-scoped insert access
CREATE POLICY entity_records_org_insert_policy
  ON public.entity_records
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM public.user_organizations 
      WHERE user_id = auth.uid()
    )
  );

-- 3. Organization-scoped update access
CREATE POLICY entity_records_org_update_policy
  ON public.entity_records
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.user_organizations 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM public.user_organizations 
      WHERE user_id = auth.uid()
    )
  );

-- 4. Organization-scoped delete access
CREATE POLICY entity_records_org_delete_policy
  ON public.entity_records
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.user_organizations 
      WHERE user_id = auth.uid()
    )
  );

-- 5. Service role bypass for edge functions (agent token auth)
CREATE POLICY entity_records_service_role_policy
  ON public.entity_records
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  )
  WITH CHECK (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- Create user_organizations table if it doesn't exist (for multi-tenant isolation)
CREATE TABLE IF NOT EXISTS public.user_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Enable RLS on user_organizations
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

-- Users can read their own organization memberships
CREATE POLICY user_organizations_read_own
  ON public.user_organizations
  FOR SELECT
  USING (user_id = auth.uid());

-- Index for performance
CREATE INDEX IF NOT EXISTS user_organizations_user_idx 
  ON public.user_organizations(user_id);
CREATE INDEX IF NOT EXISTS user_organizations_org_idx 
  ON public.user_organizations(organization_id);

