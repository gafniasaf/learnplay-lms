-- Add admin RLS policy for student_activity_log
-- Admins should be able to view all student activity for monitoring/support

CREATE POLICY "admins view all activity"
ON public.student_activity_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
    AND org_role = 'admin'
  )
);

-- Also add admin policy for inserting activity (for system operations)
CREATE POLICY "admins insert activity"
ON public.student_activity_log
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
    AND org_role = 'admin'
  )
);

