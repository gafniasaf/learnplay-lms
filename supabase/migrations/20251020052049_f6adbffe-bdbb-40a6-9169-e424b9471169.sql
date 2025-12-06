-- Performance indexes for hot query paths

-- Index for querying sessions by user and course, with ended_at for filtering active sessions
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_course 
ON game_sessions(user_id, course_id, ended_at);

-- Index for querying attempts by round, ordered by creation time
CREATE INDEX IF NOT EXISTS idx_game_attempts_round 
ON game_attempts(round_id, created_at);

-- Index for querying assignments by org, ordered by creation time
CREATE INDEX IF NOT EXISTS idx_assignments_org_created 
ON assignments(org_id, created_at);