# Smoke Test Checklist

Manual verification checklist for critical user journeys after deployment.

## Prerequisites

- [ ] Supabase project is running
- [ ] All Edge Functions deployed (verified via `verify-live-deployment.ts`)
- [ ] Test user accounts created (or use existing accounts)
- [ ] Browser console open (F12) to check for errors

---

## Test 1: Login/Auth Flow

**Steps:**
1. Navigate to `/auth`
2. Enter valid credentials
3. Submit login form

**Expected Result:**
- ✅ Redirects to dashboard (not `/auth`)
- ✅ No console errors
- ✅ User session persists on page refresh

**Status:** [ ] PASS [ ] FAIL

**Notes:**

---

## Test 2: Course Catalog

**Steps:**
1. Navigate to `/courses`
2. Wait for catalog to load

**Expected Result:**
- ✅ Course list displays from database
- ✅ Courses show metadata (title, description, etc.)
- ✅ No "Loading..." spinner stuck
- ✅ No console errors

**Status:** [ ] PASS [ ] FAIL

**Notes:**

---

## Test 3: Play Game

**Steps:**
1. Select a course from catalog
2. Click "Play" button
3. Answer a question

**Expected Result:**
- ✅ Game loads successfully
- ✅ Items display correctly
- ✅ Answer submission works
- ✅ Score updates in real-time
- ✅ No console errors

**Status:** [ ] PASS [ ] FAIL

**Notes:**

---

## Test 4: Submit Answer & Score Logging

**Steps:**
1. Play a game round
2. Answer multiple questions (correct and incorrect)
3. Complete the round

**Expected Result:**
- ✅ Each answer is logged to database
- ✅ Score increments correctly
- ✅ Round completion creates database record
- ✅ Check Supabase Dashboard > Database > `game_rounds` table

**Status:** [ ] PASS [ ] FAIL

**Notes:**

---

## Test 5: Generate Course

**Steps:**
1. Navigate to `/admin/courses`
2. Click "Generate Course" or fill out generation form
3. Submit generation request

**Expected Result:**
- ✅ Job is enqueued successfully
- ✅ Job ID is returned
- ✅ Job progress updates in UI
- ✅ Check Supabase Dashboard > Database > `ai_course_jobs` table

**Status:** [ ] PASS [ ] FAIL

**Notes:**

---

## Test 6: Publish Course

**Steps:**
1. Navigate to course editor
2. Make a change to course content
3. Click "Publish" button

**Expected Result:**
- ✅ Version increments
- ✅ Success toast appears
- ✅ Course metadata updated in database
- ✅ Check Supabase Dashboard > Database > `course_metadata` table

**Status:** [ ] PASS [ ] FAIL

**Notes:**

---

## Test 7: Database Verification

**SQL Queries to Run in Supabase Dashboard:**

```sql
-- Check recent game rounds
SELECT * FROM game_rounds ORDER BY created_at DESC LIMIT 5;

-- Check recent AI jobs
SELECT * FROM ai_course_jobs ORDER BY created_at DESC LIMIT 5;

-- Check course metadata
SELECT * FROM course_metadata ORDER BY updated_at DESC LIMIT 5;

-- Check user sessions
SELECT * FROM auth.sessions ORDER BY created_at DESC LIMIT 5;
```

**Expected Result:**
- ✅ Data is being written to database
- ✅ Timestamps are recent
- ✅ Foreign keys are valid

**Status:** [ ] PASS [ ] FAIL

**Notes:**

---

## Summary

**Tests Passed:** ___ / 7
**Critical Issues:** ___
**Minor Issues:** ___

**Overall Status:** [ ] READY FOR PRODUCTION [ ] NEEDS FIXES

**Date Completed:** ___________
**Tested By:** ___________

