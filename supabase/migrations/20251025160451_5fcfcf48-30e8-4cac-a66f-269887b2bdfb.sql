-- Step 1: Just add the columns
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();