# Edge Function Error Handling Tests

## Overview

Comprehensive test suite for edge function error handling, catching issues like:
- CORS errors in preview environments
- 400 validation errors (missing required parameters)
- 401 authentication errors
- 500 server errors
- Network failures

## Test Files

### Integration Tests
**File:** `tests/integration/edge-function-errors.spec.ts`

Tests error handling logic with mocked fetch:
- CORS error detection
- 400 validation error handling
- 401 authentication error handling
- 500 server error handling
- Network timeout handling

**Run:** `npm run test:integration -- edge-function-errors`

### E2E Tests
**File:** `tests/e2e/live-edge-function-errors.spec.ts`

Tests real UI behavior when edge functions fail:
- Course editor handles CORS gracefully
- Logs page handles CORS gracefully
- Student dashboard handles missing studentId
- Course selector handles org-config CORS
- Assignments page handles CORS
- No blank screens on failures

**Run:** `npm run e2e:live -- live-edge-function-errors`

## Bugs Caught

### ✅ Fixed: student-dashboard missing studentId
**Issue:** Edge function returned `400: studentId required`  
**Fix:** Updated `src/lib/api/auth.ts` to extract `studentId` from authenticated user  
**Test:** E2E test verifies dashboard loads or shows graceful error

### ✅ CORS Errors in Lovable Preview
**Issue:** Multiple CORS errors in preview environments  
**Fix:** Error handling already graceful, tests verify no crashes  
**Test:** E2E tests verify user-friendly error messages

### ✅ Missing Required Parameters
**Issue:** Edge functions return 400 without user-friendly messages  
**Test:** Integration tests verify error messages are user-friendly

## Running Tests

```bash
# Integration tests (mocked)
npm run test:integration -- edge-function-errors

# E2E tests (real Supabase)
npm run e2e:live -- live-edge-function-errors

# All edge function error tests
npm run test:integration -- edge-function-errors && npm run e2e:live -- live-edge-function-errors
```

## Database Seeding

**File:** `scripts/seed-database.ts`

Seeds database with:
- Courses (course_metadata + JSON in storage)
- Students (profiles + organization_users + metrics)
- Teachers (profiles + organization_users)
- Parents (profiles + organization_users)
- Assignments (for students)

**Usage:**
```bash
npx tsx scripts/seed-database.ts
```

**Default Password:** `DemoPass123!` (for all demo users)

**Users Created:**
- `student1@demo.learnplay.dev` / `student2@demo.learnplay.dev`
- `teacher1@demo.learnplay.dev` / `teacher2@demo.learnplay.dev`
- `parent1@demo.learnplay.dev` / `parent2@demo.learnplay.dev`

## Schema Notes

- `course_metadata`: Only metadata columns (id, organization_id, visibility, tag_ids, etc.). Course JSON stored in `courses` storage bucket.
- `profiles`: No `organization_id` column. Use `organization_users` table to link users to orgs.
- `student_metrics`: No `organization_id` column. Linked via `student_id` (user ID).
- `assignments`: Uses `org_id` (not `organization_id`), no `description` column.
- Parent-student linking: Via `organization_users` table (same `org_id`).

