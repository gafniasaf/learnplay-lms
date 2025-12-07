# E2E Test Scenarios That Catch Real Bugs

## Overview
This document outlines comprehensive E2E test scenarios that would catch the bugs we've been fixing manually. These tests use **REAL Supabase** and **REAL LLM calls** - no mocks!

## Test Categories

### 1. Course Creation → Navigation Flow
**Bugs Caught:** Wrong route, missing courseId, navigation failures

**Scenarios:**
- ✅ Create course → Wait for completion → Click "View Course" → Verify route `/admin/editor/:courseId`
- ✅ Create course → Extract courseId from localStorage → Verify it's not `ai_course_generate`
- ✅ Create course → Reload page → Verify courseId persists → Click "View Course" → Verify navigation
- ✅ Create course → Click "View Course" before completion → Verify error message
- ✅ Create course → Extract courseId from job object → Verify it matches localStorage

**Test File:** `tests/e2e/live-course-navigation.spec.ts`

### 2. CourseId Extraction & Storage
**Bugs Caught:** Missing courseId, wrong courseId source, persistence issues

**Scenarios:**
- ✅ Verify courseId stored in localStorage when job created
- ✅ Verify courseId extracted from job object when available
- ✅ Verify courseId extracted from job payload as fallback
- ✅ Verify courseId persists across page reloads
- ✅ Verify courseId NOT set to job type (`ai_course_generate`)

**Test File:** `tests/e2e/live-course-navigation.spec.ts`

### 3. Route Validation
**Bugs Caught:** Wrong routes, 404 errors, broken navigation

**Scenarios:**
- ✅ All course links use `/admin/editor/:courseId` not `/admin/courses/:courseId`
- ✅ Direct navigation to `/admin/editor/:courseId` works (not 404)
- ✅ Navigation from "View Course" button uses correct route
- ✅ Navigation from job list uses correct route
- ✅ Navigation from course catalog uses correct route

**Test File:** `tests/e2e/live-course-navigation.spec.ts`

### 4. AI Pipeline Full Flow (Live LLM)
**Bugs Caught:** Job creation failures, LLM errors, storage issues

**Scenarios:**
- ✅ Create course with LLM → Verify text content generated
- ✅ Create course with DALL-E → Verify images generated and stored
- ✅ Create course → Verify course stored in Supabase
- ✅ Create course → Verify course retrievable from Supabase
- ✅ Create course → Verify course appears in catalog

**Test File:** `tests/e2e/live-ai-pipeline.spec.ts`

### 5. Course Editor LLM Features (Live LLM)
**Bugs Caught:** LLM feature failures, API errors, UI bugs

**Scenarios:**
- ✅ Course editor → Click "Rewrite" → Enter prompt → Verify LLM response
- ✅ Course editor → Click "Variants Audit" → Verify audit completes
- ✅ Course editor → Click "Co-Pilot Enrich" → Verify enrichment job created
- ✅ Course editor → Click "Co-Pilot Variants" → Verify variants job created
- ✅ Course editor → Verify all LLM buttons are enabled/disabled correctly

**Test File:** `tests/e2e/live-ai-pipeline.spec.ts`

### 6. Authentication & Authorization
**Bugs Caught:** 401 errors, missing org_id, stale tokens

**Scenarios:**
- ✅ Guest user → Try to create course → Verify error message
- ✅ Admin user → Create course → Verify success
- ✅ Admin user → Logout → Login → Create course → Verify works
- ✅ Admin user → Create course → Verify no 401 errors
- ✅ Admin user → Verify organization_id in session

**Test File:** `tests/e2e/live-admin-jobs.spec.ts`

### 7. Error Handling & User Feedback
**Bugs Caught:** Silent failures, unclear error messages, missing feedback

**Scenarios:**
- ✅ Create course with invalid input → Verify error message shown
- ✅ Create course → API returns 401 → Verify user-friendly error
- ✅ Create course → API returns 500 → Verify error message
- ✅ Create course → Network error → Verify error handling
- ✅ Create course → Job fails → Verify failure message shown

**Test File:** `tests/e2e/live-api-integration.spec.ts`

### 8. Job Status & Progress
**Bugs Caught:** Status not updating, progress not showing, stuck jobs

**Scenarios:**
- ✅ Create course → Verify job status updates (pending → processing → done)
- ✅ Create course → Verify progress bar updates
- ✅ Create course → Verify phase indicators update
- ✅ Create course → Verify job events appear
- ✅ Create course → Verify completion time shown

**Test File:** `tests/e2e/live-ai-pipeline.spec.ts`

## Running Tests

### All Live Tests
```bash
npm run e2e:live
```

### Specific Test File
```bash
npx playwright test tests/e2e/live-course-navigation.spec.ts --config=playwright.live.config.ts
```

### With Browser UI (for debugging)
```bash
HEADED=1 npm run e2e:live
```

### Single Test
```bash
npx playwright test tests/e2e/live-course-navigation.spec.ts -g "create course" --config=playwright.live.config.ts
```

## Test Coverage Goals

### Critical Paths (Must Pass)
- ✅ Course creation → Navigation → Editor
- ✅ CourseId extraction and storage
- ✅ Route correctness
- ✅ Authentication flow

### Important Paths (Should Pass)
- ✅ LLM features (rewrite, variants, co-pilot)
- ✅ Image generation and storage
- ✅ Error handling
- ✅ Job status updates

### Nice-to-Have (Can Skip)
- ⏳ Performance benchmarks
- ⏳ Load testing
- ⏳ Edge cases

## What These Tests Catch

### Recent Bugs Fixed
1. **Wrong Route Bug** ✅
   - Test: "View Course button navigates to /admin/editor/:courseId"
   - Would have failed: Navigation went to `/admin/courses/:courseId`

2. **Missing CourseId Bug** ✅
   - Test: "courseId extracted from job object"
   - Would have failed: courseId was null or `ai_course_generate`

3. **Persistence Bug** ✅
   - Test: "courseId persists across page reloads"
   - Would have failed: courseId lost on reload

4. **401 Error Bug** ✅
   - Test: "Admin user can create course without 401"
   - Would have failed: 401 errors shown

5. **OpenAI Key Missing** ✅
   - Test: "Course creation with LLM succeeds"
   - Would have failed: "OpenAI key missing" error

## Adding New Tests

When you find a bug manually:
1. **Write a test that reproduces it** (should fail)
2. **Fix the bug**
3. **Verify test passes**
4. **Add test to this suite**

This ensures the bug never comes back!

