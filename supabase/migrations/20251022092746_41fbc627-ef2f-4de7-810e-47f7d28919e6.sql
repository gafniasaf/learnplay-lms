-- Fix security vulnerability: Prevent enumeration of all class join codes
-- Remove the overly permissive policy that allows anyone to read all active codes
DROP POLICY IF EXISTS "anyone can read active codes" ON public.class_join_codes;

-- The join_class_with_code function is SECURITY DEFINER, so it can still access codes
-- This ensures users can only validate specific codes they possess, not enumerate all codes

-- Note: The existing "teachers manage class codes" policy already allows teachers/admins
-- to view codes for classes in their organization, which is appropriate for management purposes