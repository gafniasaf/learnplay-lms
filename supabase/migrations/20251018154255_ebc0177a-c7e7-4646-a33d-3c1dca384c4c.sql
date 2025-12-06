-- Fix infinite recursion in organization_users RLS by using security definer function
-- Create function to check org membership
CREATE OR REPLACE FUNCTION public.user_has_org_role(_user_id uuid, _org_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users
    WHERE user_id = _user_id
      AND org_id = _org_id
      AND org_role = ANY(_roles)
  )
$$;

-- Drop existing policies on organization_users
DROP POLICY IF EXISTS "org admins read all org users" ON organization_users;
DROP POLICY IF EXISTS "view own org user" ON organization_users;

-- Recreate policies using the security definer function
CREATE POLICY "org admins read all org users" 
ON organization_users 
FOR SELECT 
USING (
  public.user_has_org_role(auth.uid(), org_id, ARRAY['school_admin'])
);

CREATE POLICY "view own org user" 
ON organization_users 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create class_join_codes table for join code functionality
CREATE TABLE IF NOT EXISTS public.class_join_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_by uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

-- Enable RLS on class_join_codes
ALTER TABLE public.class_join_codes ENABLE ROW LEVEL SECURITY;

-- Teachers can create/view codes for their org's classes
CREATE POLICY "teachers manage class codes"
ON public.class_join_codes
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = class_join_codes.class_id
      AND public.user_has_org_role(auth.uid(), c.org_id, ARRAY['school_admin', 'teacher'])
  )
);

-- Anyone can read active codes to join (we'll validate in edge function)
CREATE POLICY "anyone can read active codes"
ON public.class_join_codes
FOR SELECT
USING (is_active = true AND expires_at > now());

-- Create function to generate unique 6-character alphanumeric code
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 6-character uppercase alphanumeric code
    new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    
    -- Check if code already exists and is active
    SELECT EXISTS(
      SELECT 1 
      FROM class_join_codes 
      WHERE code = new_code 
        AND is_active = true 
        AND expires_at > now()
    ) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$;