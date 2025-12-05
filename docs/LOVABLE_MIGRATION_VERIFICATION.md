# Lovable Migration Verification Prompts

## After Running Multimedia Migrations

Copy and paste these verification prompts to Lovable to confirm the migrations ran successfully.

---

## **Verification Prompt 1: Check Tables Exist**

```
Verify the multimedia migrations ran successfully:

Task:
1. Check if table media_generation_providers exists and has data
2. Check if table media_assets exists
3. Check if ai_media_jobs has new columns
4. Test all RPC functions work

Run these SQL queries and show results:

-- 1. Check media_generation_providers table and data
SELECT id, name, media_types, enabled, cost_per_unit, quality_rating 
FROM public.media_generation_providers 
ORDER BY id;

-- Should return 7 rows:
-- openai-dalle3, openai-dalle3-hd, replicate-sdxl, openai-tts, openai-tts-hd, elevenlabs, replicate-zeroscope

-- 2. Check ai_media_jobs has new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'ai_media_jobs'
  AND column_name IN ('idempotency_key', 'target_ref', 'provider', 'style', 'priority', 'attempts', 'last_heartbeat', 'dead_letter_reason', 'asset_version', 'cost_usd')
ORDER BY column_name;

-- Should return 10 rows (all new columns)

-- 3. Check media_assets table exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'media_assets'
ORDER BY ordinal_position
LIMIT 10;

-- Should return columns: id, logical_id, version, storage_path, storage_bucket, public_url, media_type, mime_type, file_size_bytes, duration_seconds

Acceptance:
✓ media_generation_providers has 7 providers
✓ ai_media_jobs has 10 new columns
✓ media_assets table exists with correct schema
✓ All queries run without errors
```

---

## **Verification Prompt 2: Test RPC Functions**

```
Test all RPC functions created by the migrations:

Run these function calls and verify they work:

-- 1. Test get_providers_for_media_type (should return image providers)
SELECT id, name, cost_per_unit, quality_rating
FROM public.get_providers_for_media_type('image')
ORDER BY quality_rating DESC, cost_per_unit ASC;

-- Expected: openai-dalle3, openai-dalle3-hd (replicate-sdxl disabled by default)

-- 2. Test get_providers_for_media_type for audio
SELECT id, name, cost_per_unit
FROM public.get_providers_for_media_type('audio');

-- Expected: openai-tts, openai-tts-hd (elevenlabs disabled)

-- 3. Test generate_media_idempotency_key
SELECT public.generate_media_idempotency_key(
  'image',
  'Test prompt for liver anatomy',
  '{"type": "item_stimulus", "courseId": "test", "itemId": 1}'::jsonb,
  'openai-dalle3'
);

-- Expected: Returns a SHA-256 hash string (64 characters)

-- 4. Test mark_stale_media_jobs (should return 0 - no stale jobs yet)
SELECT public.mark_stale_media_jobs();

-- Expected: Returns 0

-- 5. Test move_media_jobs_to_dead_letter (should return 0)
SELECT public.move_media_jobs_to_dead_letter();

-- Expected: Returns 0

Acceptance:
✓ get_providers_for_media_type returns correct providers
✓ generate_media_idempotency_key returns SHA-256 hash
✓ Stale job functions execute without errors
✓ All RPC functions return expected results
```

---

## **Verification Prompt 3: Test Indexes and Constraints**

```
Verify indexes and constraints are in place:

-- 1. Check indexes on media_generation_providers
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'media_generation_providers'
ORDER BY indexname;

-- Expected: idx_providers_media_types (GIN), idx_providers_enabled

-- 2. Check indexes on ai_media_jobs
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ai_media_jobs'
  AND indexname LIKE '%idempotency%' OR indexname LIKE '%target_ref%' OR indexname LIKE '%priority%' OR indexname LIKE '%heartbeat%'
ORDER BY indexname;

-- Expected: ai_media_jobs_idempotency_unique, ai_media_jobs_target_ref_idx, ai_media_jobs_priority_idx, ai_media_jobs_heartbeat_idx

-- 3. Check indexes on media_assets
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'media_assets'
ORDER BY indexname;

-- Expected: Multiple indexes including media_assets_logical_id_idx, media_assets_provider_idx, media_assets_prompt_search_idx

-- 4. Test unique constraint on media_assets (logical_id, version)
-- This should succeed
INSERT INTO public.media_assets (logical_id, version, storage_path, public_url, media_type, provider, prompt)
VALUES ('test-asset', 1, 'test/path.png', 'https://example.com/test.png', 'image', 'openai-dalle3', 'Test prompt');

-- This should fail with unique constraint violation
INSERT INTO public.media_assets (logical_id, version, storage_path, public_url, media_type, provider, prompt)
VALUES ('test-asset', 1, 'test/path2.png', 'https://example.com/test2.png', 'image', 'openai-dalle3', 'Test prompt 2');

-- Clean up test data
DELETE FROM public.media_assets WHERE logical_id = 'test-asset';

Acceptance:
✓ All expected indexes exist
✓ Unique constraint works (prevents duplicate logical_id + version)
✓ GIN indexes on arrays and jsonb columns
✓ Partial indexes on filtered columns
```

---

## **Verification Prompt 4: Test RLS Policies**

```
Test Row Level Security policies are working:

-- 1. Test media_generation_providers policies
-- As anonymous user (public access to enabled providers only)
SET ROLE anon;
SELECT id, enabled FROM public.media_generation_providers;
-- Expected: Only returns enabled = true providers

RESET ROLE;

-- 2. Test media_assets policies
-- Create a test user context
SET request.jwt.claims.sub TO '123e4567-e89b-12d3-a456-426614174000';

-- Insert an asset as this user
INSERT INTO public.media_assets (
  logical_id, version, storage_path, public_url, media_type, provider, prompt, created_by
) VALUES (
  'test-user-asset', 1, 'test/user.png', 'https://example.com/user.png', 
  'image', 'openai-dalle3', 'Test user asset',
  '123e4567-e89b-12d3-a456-426614174000'::uuid
);

-- User should see their own asset
SELECT logical_id FROM public.media_assets WHERE created_by = '123e4567-e89b-12d3-a456-426614174000'::uuid;
-- Expected: Returns 'test-user-asset'

-- Clean up
DELETE FROM public.media_assets WHERE logical_id = 'test-user-asset';
RESET ROLE;

Acceptance:
✓ Anonymous users can only read enabled providers
✓ Users can insert assets with their own created_by
✓ Users can read their own assets
✓ RLS policies enforce ownership
```

---

## **Verification Prompt 5: Test Media Asset Search**

```
Test the full-text search functionality on media assets:

-- 1. Insert test assets with different prompts
INSERT INTO public.media_assets (logical_id, version, storage_path, public_url, media_type, provider, prompt, alt_text, status)
VALUES 
  ('liver-test-1', 1, 'test/liver1.png', 'https://example.com/liver1.png', 'image', 'openai-dalle3', 'Detailed liver anatomy diagram showing all lobes', 'Liver anatomy', 'active'),
  ('heart-test-1', 1, 'test/heart1.png', 'https://example.com/heart1.png', 'image', 'openai-dalle3', 'Human heart cross-section with chambers labeled', 'Heart diagram', 'active'),
  ('brain-test-1', 1, 'test/brain1.png', 'https://example.com/brain1.png', 'image', 'openai-dalle3', 'Brain anatomy showing cerebral cortex', 'Brain structure', 'active');

-- 2. Test search by prompt
SELECT logical_id, prompt
FROM public.search_assets_by_prompt('liver anatomy', 5);

-- Expected: Returns 'liver-test-1' first (best match)

-- 3. Test search by alt text
SELECT logical_id, alt_text
FROM public.search_assets_by_prompt('heart', 5);

-- Expected: Returns 'heart-test-1'

-- 4. Test get_latest_asset_version
SELECT logical_id, version
FROM public.get_latest_asset_version('liver-test-1');

-- Expected: Returns version 1

-- 5. Test increment_asset_usage
SELECT public.increment_asset_usage((SELECT id FROM public.media_assets WHERE logical_id = 'liver-test-1'));
SELECT usage_count FROM public.media_assets WHERE logical_id = 'liver-test-1';

-- Expected: usage_count = 1

-- Clean up test data
DELETE FROM public.media_assets WHERE logical_id LIKE '%-test-%';

Acceptance:
✓ Full-text search finds assets by prompt keywords
✓ Search ranks results by relevance
✓ get_latest_asset_version returns correct row
✓ increment_asset_usage increments counter
✓ All search functions perform well
```

---

## **Combined Single Verification Prompt (Simplified)**

```
Verify multimedia migrations (20251024100000, 20251024100001, 20251024100002):

Run this comprehensive verification query:

-- Check all tables and providers
SELECT 
  (SELECT count(*) FROM public.media_generation_providers) as provider_count,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'ai_media_jobs' AND column_name = 'idempotency_key') as jobs_enhanced,
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'media_assets') as assets_table_exists;

-- Expected: provider_count = 7, jobs_enhanced = 1, assets_table_exists = 1

-- List all providers
SELECT id, name, enabled, cost_per_unit, quality_rating 
FROM public.media_generation_providers 
ORDER BY quality_rating DESC, cost_per_unit ASC;

-- Test image providers function
SELECT id, name 
FROM public.get_providers_for_media_type('image')
LIMIT 3;

-- Check ai_media_jobs new columns exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'ai_media_jobs' 
  AND column_name IN ('idempotency_key', 'target_ref', 'provider', 'style', 'asset_version', 'cost_usd')
ORDER BY column_name;

-- Check media_assets schema
SELECT count(*) as column_count
FROM information_schema.columns 
WHERE table_name = 'media_assets';

-- Should return ~25 columns

Acceptance criteria:
✓ 7 providers in media_generation_providers
✓ 10 new columns in ai_media_jobs
✓ media_assets table has ~25 columns
✓ get_providers_for_media_type('image') returns DALL-E providers
✓ All queries execute without errors

If all checks pass, respond: "✅ All multimedia migrations successful"
```

---

**Use the "Combined Single Verification Prompt" for quickest verification!** 

It runs all essential checks in one go and confirms the 3 migrations are working correctly.
