-- Content and version integrity constraints (fixed)

-- Add content_version to game_rounds with valid default
ALTER TABLE game_rounds 
ADD COLUMN IF NOT EXISTS content_version TEXT NOT NULL DEFAULT 'legacy';

-- Add item_key to game_attempts with valid default format
ALTER TABLE game_attempts 
ADD COLUMN IF NOT EXISTS item_key TEXT NOT NULL DEFAULT '0:unknown:1';

-- Constraint: item_key must match format "itemId:clusterId:variant"
-- e.g., "5:c2:1" = item 5, cluster c2, variant 1
ALTER TABLE game_attempts 
DROP CONSTRAINT IF EXISTS chk_item_key_format;

ALTER TABLE game_attempts 
ADD CONSTRAINT chk_item_key_format 
CHECK (item_key ~ '^[0-9]+:[A-Za-z0-9_-]+:[123]$');

-- Constraint: content_version must not be empty for new rows
ALTER TABLE game_rounds 
DROP CONSTRAINT IF EXISTS chk_content_version_nonempty;

ALTER TABLE game_rounds 
ADD CONSTRAINT chk_content_version_nonempty 
CHECK (length(content_version) > 0);