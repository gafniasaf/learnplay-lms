-- Create pending_invites table for email-based student invitations
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  accepted BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(org_id, email, class_id)
);

-- Enable RLS
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Policy: Teachers/admins can view invites for their org
CREATE POLICY "teachers view org invites" 
ON public.pending_invites 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE ou.org_id = pending_invites.org_id
    AND ou.user_id = auth.uid()
    AND ou.org_role IN ('school_admin', 'teacher')
  )
);

-- Policy: Teachers/admins can create invites for their org
CREATE POLICY "teachers create org invites" 
ON public.pending_invites 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE ou.org_id = pending_invites.org_id
    AND ou.user_id = auth.uid()
    AND ou.org_role IN ('school_admin', 'teacher')
  )
);

-- Policy: Teachers/admins can delete invites for their org
CREATE POLICY "teachers delete org invites" 
ON public.pending_invites 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE ou.org_id = pending_invites.org_id
    AND ou.user_id = auth.uid()
    AND ou.org_role IN ('school_admin', 'teacher')
  )
);

-- Create index for faster lookups
CREATE INDEX idx_pending_invites_email ON public.pending_invites(email);
CREATE INDEX idx_pending_invites_org_id ON public.pending_invites(org_id);
CREATE INDEX idx_pending_invites_class_id ON public.pending_invites(class_id);

-- Add RLS policy for teachers to create classes
CREATE POLICY "teachers create classes" 
ON public.classes 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE ou.org_id = classes.org_id
    AND ou.user_id = auth.uid()
    AND ou.org_role IN ('school_admin', 'teacher')
  )
);

-- Add RLS policy for teachers to update classes
CREATE POLICY "teachers update classes" 
ON public.classes 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE ou.org_id = classes.org_id
    AND ou.user_id = auth.uid()
    AND ou.org_role IN ('school_admin', 'teacher')
  )
);

-- Add RLS policy for teachers to delete classes
CREATE POLICY "teachers delete classes" 
ON public.classes 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE ou.org_id = classes.org_id
    AND ou.user_id = auth.uid()
    AND ou.org_role IN ('school_admin', 'teacher')
  )
);