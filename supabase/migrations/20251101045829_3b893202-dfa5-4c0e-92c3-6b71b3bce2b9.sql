-- Drop the restrictive view policy
DROP POLICY IF EXISTS "view own profile" ON public.profiles;

-- Create a more permissive policy that allows authenticated users to view basic profile information
CREATE POLICY "authenticated users can view profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep the update policy restrictive (users can only update their own profile)
-- This policy should already exist but let's ensure it's there
DROP POLICY IF EXISTS "update own profile" ON public.profiles;

CREATE POLICY "users can update own profile" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);