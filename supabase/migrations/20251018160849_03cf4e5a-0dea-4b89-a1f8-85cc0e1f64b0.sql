-- Add owner and description columns to classes table
ALTER TABLE public.classes
ADD COLUMN IF NOT EXISTS owner uuid REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS description text;

-- Backfill owner from org_id for existing classes
-- Set owner to the first teacher/admin found in the org
UPDATE public.classes
SET owner = (
  SELECT ou.user_id
  FROM public.organization_users ou
  WHERE ou.org_id = classes.org_id
    AND ou.org_role IN ('school_admin', 'teacher')
  LIMIT 1
)
WHERE owner IS NULL;

-- Add index for owner lookups
CREATE INDEX IF NOT EXISTS idx_classes_owner ON public.classes(owner);

-- Create owner-based RLS policies for classes
DROP POLICY IF EXISTS "teachers create classes" ON public.classes;
DROP POLICY IF EXISTS "teachers delete classes" ON public.classes;
DROP POLICY IF EXISTS "teachers read classes in org" ON public.classes;
DROP POLICY IF EXISTS "teachers update classes" ON public.classes;

-- Owner can read their own classes
CREATE POLICY "owners read their classes"
ON public.classes
FOR SELECT
TO authenticated
USING (owner = auth.uid());

-- Owner can create classes
CREATE POLICY "users create classes"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (owner = auth.uid());

-- Owner can update their classes
CREATE POLICY "owners update their classes"
ON public.classes
FOR UPDATE
TO authenticated
USING (owner = auth.uid());

-- Owner can delete their classes
CREATE POLICY "owners delete their classes"
ON public.classes
FOR DELETE
TO authenticated
USING (owner = auth.uid());

-- Update class_members policies to use owner
DROP POLICY IF EXISTS "teachers view class members" ON public.class_members;
DROP POLICY IF EXISTS "view own class membership" ON public.class_members;

CREATE POLICY "class owners view members"
ON public.class_members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = class_members.class_id
      AND c.owner = auth.uid()
  )
);

CREATE POLICY "students view own membership"
ON public.class_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "class owners manage members"
ON public.class_members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = class_members.class_id
      AND c.owner = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.classes c
    WHERE c.id = class_members.class_id
      AND c.owner = auth.uid()
  )
);