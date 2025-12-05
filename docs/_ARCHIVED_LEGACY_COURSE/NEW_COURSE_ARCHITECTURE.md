# New Course Generation Architecture

## Overview

The course generation system now runs through a **strategy orchestrator** that prioritizes deterministic knowledge packs, falls back to a skeleton + LLM filler when needed, and always finishes with programmatic validators and a safe placeholder fallback. The repair/review treadmill is gone—every request returns a single, schema-valid course.

## Architecture

### Old System (DELETED)
- ❌ LLM writes everything freeform (structure + content)
- ❌ Repair loops when validation fails
- ❌ Review gating that fails jobs
- ❌ JSON parse failures
- ❌ Context loss across multiple prompts
- ❌ Orchestrator/candidate/review Edge Functions

### New System (IMPLEMENTED)
```
1. Strategy Orchestrator
   ├─> Deterministic Builder (knowledge packs, seeded RNG)
   └─> Skeleton Builder → LLM Filler (fallback when no pack)

2. Validator (programmatic gates)
   └─> Schema, placeholder counts, math, lexicon, readability, banned terms

3. Persistence
   └─> Upload course.json, upsert metadata (course_metadata + courses)

4. Completion + Fallback
   └─> Save job summary, mark status, emit placeholder on failure paths
```

## What's New

### Modules Created

1. **`_shared/deterministic.ts`**  
   - Loads knowledge packs from `content/packs`.  
   - Generates complete courses (study texts + items) with seeded RNG.  
   - Runs pack-level gates (lexicon, banned terms, readability) before returning.

2. **`_shared/gates.ts`**  
   - Shared utilities for lexicon, banned term, and readability enforcement.  
   - Reused by both deterministic path and validator fallback.

3. **`_shared/generation-strategy.ts`**  
   - Picks deterministic vs skeleton path.  
   - Returns pack metadata for downstream logging.

4. **`_shared/skeleton.ts` & `_shared/filler.ts`** (refined)  
   - Skeleton still deterministic for non-pack subjects.  
   - LLM filler now strictly boxed (IDs, structure, math metadata preserved).

5. **`_shared/course-validator.ts`**  
   - Accepts optional knowledge pack context to run gates.  
   - Centralizes all schema + business rule checks.

6. **`_shared/metadata.ts`**  
   - Upserts both `course_metadata` (catalog) and `courses` (legacy summary).  
   - Records catalog update entries when version bumps.

7. **`generate-course/orchestrator.ts`**  
   - Pure function orchestrating strategy selection, validation, persistence, and fallbacks.  
   - Returns both HTTP response payload and job summary metadata.

8. **`generate-course/index.ts`** (rewritten)  
   - Wires HTTP handler to orchestrator with concrete Supabase dependencies.  
  - Provides placeholder builder, storage writes, job progress, and failure handling.

### Modules Deleted

- `ai-orchestrator/`
- `generate-candidates/`
- `review-candidate/`
- `score-candidate/`

All legacy repair/review/improve logic removed from `generate-course`.

## Deployment

### 1. Deploy to Supabase

From your repo root:

```bash
# Deploy the new generate-course
supabase functions deploy generate-course

# If you have multiple projects:
supabase functions deploy generate-course --project-ref <your_project_ref>
```

Or via **Supabase Dashboard**:
1. Go to Edge Functions → `generate-course`
2. Verify code matches local (look for `SKEL:`, `FILL:`, `VALIDATE:` log messages)
3. Hit Save/Deploy

### 2. Verify Deployment

After deploying, trigger a job from your UI with:
- Subject: "addition"
- Grade: "Grade 2"
- Items per group: 8
- Levels: 3
- Mode: options

After the job completes:

- Inspect `ai_course_jobs` for the new `summary` payload. It should include `provider`, `deterministicPack`, and `fallbackReason` (if any).  
- Download `courses/debug/jobs/<jobId>/summary.json` from Storage to confirm the orchestrator wrote the same JSON summary.  
- Verify that `courses/<courseId>/course.json` exists and matches the deterministic or LLM-filled course you expect.

### 3. Expected Response

**Success:**
```json
{
  "success": true,
  "course": { /* valid Course v2 */ },
  "source": "deterministic",
  "imagesPending": 0,
  "imagesNote": "Images can be generated via enqueue-course-media",
  "metadata": {
    "subject": "addition",
    "title": "Addition Course",
    "gradeBand": "Grade 2",
    "mode": "options",
    "generatedAt": "2025-11-14T...",
    "validationWarnings": 0
  }
}
```

**Fallback (if LLM fails):**
```json
{
  "success": true,
  "course": { /* placeholder course */ },
  "source": "placeholder",
  "imagesPending": 0,
  "imagesNote": "Course validation failed: 2 errors",
  "metadata": {
    "subject": "addition",
    "gradeBand": "Grade 2",
    "mode": "options",
    "generatedAt": "2025-11-14T...",
    "fallbackReason": "validation_failed"
  }
}
```

## Testing Locally

Before deploying, you can test the new architecture:

```bash
# Run targeted orchestrator/unit tests
npm test -- --runTestsByPath supabase/functions/generate-course/__tests__/orchestrator.test.ts

# Full regression suite (recommended before deploy)
npm test
```

To test the Edge Function locally with real LLM:

```bash
# Serve the function
supabase functions serve generate-course

# In another terminal, call it
curl -X POST http://localhost:54321/functions/v1/generate-course \
  -H "Authorization: Bearer <your_anon_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "multiplication",
    "grade": "Grade 3",
    "itemsPerGroup": 6,
    "levelsCount": 2,
    "mode": "options"
  }'
```

**Required environment variables** (in `.env.local` or Supabase secrets):
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Benefits

### Predictability
- ✅ Structure is 100% deterministic
- ✅ Same subject/grade/params → same skeleton every time
- ✅ Reproducible for debugging

### Reliability
- ✅ No more repair loops
- ✅ No more review gating failures
- ✅ Validation happens **after** generation, not during
- ✅ Math correctness enforced programmatically

### Performance
- ✅ Single LLM call (vs 3+ in old system)
- ✅ No orchestration network hops
- ✅ Falls back to placeholder instantly if LLM fails

### Maintainability
- ✅ Clear separation: skeleton (code) vs content (LLM)
- ✅ Easy to add new validators
- ✅ Easy to tweak prompts without breaking structure

## Next Steps (Optional Enhancements)

1. **Structured Prompts for Clusters**
   - Make LLM explicitly output cluster definitions
   - "For each cluster, write 3 variants that test the same concept"

2. **Best-of-K Selection**
   - Generate 2-3 filled courses
   - Score them with validators
   - Pick highest-scoring one

3. **Topic-Specific Constraints**
   - Simple JSON configs: allowed vocab, banned terms, key facts
   - No full "packs" needed; just hints for the LLM

4. **Expand Skeleton Intelligence**
   - Detect more subject types (history, geography, etc.)
   - Auto-create better group names

## Troubleshooting

### "LLM filler failed" in logs
- Check `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set in Supabase secrets
- Check API key quota/billing
- Check Supabase logs for the actual LLM error

### "Course validation failed" with math errors
- The skeleton embeds correct math answers in `_meta`
- If LLM produces wrong answers, validation catches it
- This is working as intended; fallback to placeholder

### Seeing old log messages after deploy
- Supabase may be caching the old function
- Go to Dashboard → Edge Functions → generate-course
- Check the source code matches your local version
- Force redeploy by editing and saving

### Tests failing
- Run `npm test -- --passWithNoTests`
- If failures are in new modules, they should be caught locally first
- All 375 tests passed after implementing new system

## Files Changed

### Created:
- `supabase/functions/_shared/deterministic.ts`
- `supabase/functions/_shared/gates.ts`
- `supabase/functions/_shared/generation-strategy.ts`
- `supabase/functions/_shared/metadata.ts`
- `supabase/functions/generate-course/orchestrator.ts`
- `supabase/functions/generate-course/__tests__/orchestrator.test.ts`
- `supabase/functions/_shared/__tests__/generation-strategy.test.ts`
- `supabase/functions/_shared/__tests__/metadata.test.ts`
- `supabase/functions/_shared/__tests__/course-validator.test.ts`

### Modified:
- `supabase/functions/generate-course/index.ts`
- `supabase/functions/_shared/course-validator.ts`
- `supabase/functions/_shared/deterministic.ts`
- `tests/jest/supabaseClientMock.ts`
- `docs/AI_COURSE_GENERATION.md`
- `docs/NEW_COURSE_ARCHITECTURE.md` (this doc)

### Deleted:
- `supabase/functions/ai-orchestrator/`
- `supabase/functions/generate-candidates/`
- `supabase/functions/review-candidate/`
- `supabase/functions/score-candidate/`

## Summary

The old system tried to make the LLM do too much at once and then repair failures reactively. The new system gives the LLM a **precise, constrained task** (fill content into a structure) and validates **proactively** before persistence.

This eliminates:
- Context loss
- Repair treadmills
- JSON inconsistencies
- Review blocking
- Structural drift

And delivers:
- One-shot generation
- Predictable structure
- Programmatic validation
- Clear error messages
- Fallback safety
