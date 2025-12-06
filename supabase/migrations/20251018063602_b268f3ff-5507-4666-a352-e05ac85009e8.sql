-- Add assignment_id column to game_sessions to track which assignment a session is for
ALTER TABLE game_sessions
ADD COLUMN assignment_id uuid REFERENCES assignments(id) ON DELETE SET NULL;