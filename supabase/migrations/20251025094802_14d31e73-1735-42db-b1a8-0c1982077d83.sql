-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- Verify extension is enabled
COMMENT ON EXTENSION vector IS 'pgvector extension for vector similarity search';