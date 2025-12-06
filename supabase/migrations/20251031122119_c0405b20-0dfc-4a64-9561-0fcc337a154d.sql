-- Modify parent_children table to add status if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'parent_children' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.parent_children 
    ADD COLUMN status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'pending', 'inactive'));
  END IF;
END $$;

-- Add index for parent queries
CREATE INDEX IF NOT EXISTS idx_parent_children_parent_id 
  ON public.parent_children(parent_id, status);

-- Create view for parent child details (aggregates student data)
CREATE OR REPLACE VIEW public.parent_child_details AS
SELECT 
  pc.parent_id,
  pc.child_id as student_id,
  pc.status as link_status,
  pc.linked_at,
  p.full_name as student_name,
  -- Metrics from student_metrics
  COALESCE(sm.streak_days, 0) as streak_days,
  COALESCE(sm.xp_total, 0) as xp_total,
  sm.last_login_at,
  -- Count upcoming assignments
  (SELECT COUNT(*) 
   FROM student_assignments sa 
   WHERE sa.student_id = pc.child_id 
     AND sa.status IN ('not_started', 'in_progress')
     AND sa.due_at > now()
  ) as upcoming_assignments_count,
  -- Count overdue assignments (alerts)
  (SELECT COUNT(*) 
   FROM student_assignments sa 
   WHERE sa.student_id = pc.child_id 
     AND sa.status = 'overdue'
  ) as overdue_assignments_count,
  -- Count goals behind (alerts)
  (SELECT COUNT(*) 
   FROM student_goals sg 
   WHERE sg.student_id = pc.child_id 
     AND sg.status = 'behind'
  ) as goals_behind_count,
  -- Recent activity count (last 7 days)
  (SELECT COUNT(*) 
   FROM student_activity_log sal 
   WHERE sal.student_id = pc.child_id 
     AND sal.occurred_at > now() - interval '7 days'
  ) as recent_activity_count
FROM parent_children pc
LEFT JOIN profiles p ON p.id = pc.child_id
LEFT JOIN student_metrics sm ON sm.student_id = pc.child_id
WHERE pc.status = 'active';

-- Grant access to view
GRANT SELECT ON public.parent_child_details TO authenticated;