-- Add updated_at column to ai_course_jobs if it doesn't exist
ALTER TABLE ai_course_jobs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add updated_at column to ai_media_jobs if it doesn't exist
ALTER TABLE ai_media_jobs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Ensure the trigger works (or create it if missing, but usually this error means the trigger exists but column is missing)
-- checking if trigger exists and dropping/recreating is complex in pure SQL without PL/pgSQL block, 
-- but adding the column should fix the 'record "new" has no field "updated_at"' error.


