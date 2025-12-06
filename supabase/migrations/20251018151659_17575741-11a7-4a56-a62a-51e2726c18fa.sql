-- Create child_codes table for parent-child linking
CREATE TABLE IF NOT EXISTS public.child_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days'),
  used BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.child_codes ENABLE ROW LEVEL SECURITY;

-- Policy: Students can view their own codes
CREATE POLICY "students view own codes" 
ON public.child_codes 
FOR SELECT 
USING (auth.uid() = student_id);

-- Policy: Teachers can create codes for students in their org
CREATE POLICY "teachers create student codes" 
ON public.child_codes 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.org_role IN ('teacher', 'school_admin')
    AND EXISTS (
      SELECT 1 FROM organization_users ou2
      WHERE ou2.user_id = child_codes.student_id
      AND ou2.org_id = ou.org_id
    )
  )
);

-- Policy: Teachers can view codes for students in their org
CREATE POLICY "teachers view org student codes" 
ON public.child_codes 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM organization_users ou
    WHERE ou.user_id = auth.uid()
    AND ou.org_role IN ('teacher', 'school_admin')
    AND EXISTS (
      SELECT 1 FROM organization_users ou2
      WHERE ou2.user_id = child_codes.student_id
      AND ou2.org_id = ou.org_id
    )
  )
);

-- Create parent_children table for parent-child relationships
CREATE TABLE IF NOT EXISTS public.parent_children (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID NOT NULL,
  child_id UUID NOT NULL,
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(parent_id, child_id)
);

-- Enable RLS
ALTER TABLE public.parent_children ENABLE ROW LEVEL SECURITY;

-- Policy: Parents can view their linked children
CREATE POLICY "parents view own children" 
ON public.parent_children 
FOR SELECT 
USING (auth.uid() = parent_id);

-- Policy: Parents can insert their own links
CREATE POLICY "parents link children" 
ON public.parent_children 
FOR INSERT 
WITH CHECK (auth.uid() = parent_id);

-- Policy: Parents can delete their own links
CREATE POLICY "parents unlink children" 
ON public.parent_children 
FOR DELETE 
USING (auth.uid() = parent_id);

-- Policy: Children can view who their parents are
CREATE POLICY "children view own parents" 
ON public.parent_children 
FOR SELECT 
USING (auth.uid() = child_id);

-- Create indexes
CREATE INDEX idx_child_codes_student_id ON public.child_codes(student_id);
CREATE INDEX idx_child_codes_code ON public.child_codes(code);
CREATE INDEX idx_parent_children_parent_id ON public.parent_children(parent_id);
CREATE INDEX idx_parent_children_child_id ON public.parent_children(child_id);

-- Function to generate random child code
CREATE OR REPLACE FUNCTION generate_child_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 6-character alphanumeric code (uppercase only)
    code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM child_codes WHERE child_codes.code = code AND used = false) INTO exists;
    
    EXIT WHEN NOT exists;
  END LOOP;
  
  RETURN code;
END;
$$;