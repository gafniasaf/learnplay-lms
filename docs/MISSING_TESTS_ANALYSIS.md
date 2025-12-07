# Missing Tests Analysis - System-Wide Coverage Gaps

## Overview
This document identifies ALL missing tests that would prevent manual testing efforts. Based on codebase analysis, user journeys, and recent bugs.

## Critical Missing Tests

### 1. Course Editor Tests ❌ **HIGH PRIORITY**

#### Missing Unit Tests:
- ❌ `useCoursePublishing.test.ts` - Publishing, archiving, deletion logic
- ❌ `useCourseVariants.test.ts` - Variants audit, repair, missing variants
- ❌ `useCourseCoPilot.test.ts` - Co-pilot job initiation and tracking
- ❌ `CourseEditor.validation.test.ts` - Form validation (items, study texts, media)
- ❌ `ItemEditor.test.ts` - Item editing, validation, save/delete

#### Missing Integration Tests:
- ❌ Course editor → Save → Verify stored in Supabase
- ❌ Course editor → Publish → Verify published status
- ❌ Course editor → Archive → Verify archived status
- ❌ Course editor → Delete → Verify deleted
- ❌ Course editor → Variants audit → Verify audit completes
- ❌ Course editor → Co-pilot enrich → Verify job created

#### Missing E2E Tests:
- ❌ Admin → Course Editor → Edit item → Save → Verify saved
- ❌ Admin → Course Editor → Add study text → Save → Verify saved
- ❌ Admin → Course Editor → Generate variants → Verify variants created
- ❌ Admin → Course Editor → Co-pilot enrich → Verify enrichment works
- ❌ Admin → Course Editor → Publish → Verify course published
- ❌ Admin → Course Editor → Delete → Verify course deleted

**Bugs These Would Catch:**
- Save failures (silent failures)
- Validation not working
- Publish/archive/delete not persisting
- Variants not generating
- Co-pilot jobs not creating

---

### 2. Authentication & Session Management Tests ❌ **HIGH PRIORITY**

#### Missing Unit Tests:
- ❌ `useAuth.test.ts` - Login, logout, session refresh
- ❌ `refreshSession.test.ts` - Session refresh logic
- ❌ `organizationId.test.ts` - Organization ID extraction and validation

#### Missing Integration Tests:
- ❌ Login → Verify session created → Verify organization_id in session
- ❌ Logout → Verify session cleared → Verify redirect to /auth
- ❌ Session refresh → Verify new token → Verify organization_id updated
- ❌ Stale session → Verify error message → Verify refresh attempted

#### Missing E2E Tests:
- ❌ Guest user → Try to create course → Verify error message
- ❌ Admin login → Create course → Verify success
- ❌ Admin logout → Login again → Create course → Verify works
- ❌ Session expires → Try to create course → Verify refresh → Verify success

**Bugs These Would Catch:**
- Session not refreshing (401 errors)
- organization_id missing from session
- Logout not clearing session
- Guest mode not working correctly

---

### 3. Teacher Features Tests ❌ **MEDIUM PRIORITY**

#### Missing Unit Tests:
- ❌ `TeacherDashboard.test.ts` - Dashboard data loading
- ❌ `Assignments.test.ts` - Assignment creation, listing
- ❌ `ClassProgress.test.ts` - Progress tracking

#### Missing Integration Tests:
- ❌ Teacher → Create assignment → Verify stored
- ❌ Teacher → Generate remediation → Verify job created
- ❌ Teacher → View class progress → Verify data loaded

#### Missing E2E Tests:
- ❌ Teacher → Dashboard → Create assignment → Verify created
- ❌ Teacher → Assignments → Generate remediation → Verify generated
- ❌ Teacher → Class Progress → View student progress → Verify displayed

**Bugs These Would Catch:**
- Assignment creation failures
- Remediation generation failures
- Progress not loading
- Data not displaying correctly

---

### 4. Student Journey Tests ❌ **HIGH PRIORITY**

#### Missing Unit Tests:
- ❌ `Play.test.ts` - Game session logic, answer handling
- ❌ `useGameSession.test.ts` - Session state management
- ❌ `Results.test.ts` - Results calculation and display

#### Missing Integration Tests:
- ❌ Student → Start session → Verify session created
- ❌ Student → Answer question → Verify answer recorded
- ❌ Student → Complete session → Verify results saved
- ❌ Student → View dashboard → Verify progress updated

#### Missing E2E Tests:
- ❌ Student → Dashboard → Select course → Play → Answer questions → Complete → View results
- ❌ Student → Play → Network disconnect → Reconnect → Verify progress saved
- ❌ Student → Play → Close browser → Reopen → Verify can resume
- ❌ Student → Complete session → Verify progress updated on dashboard

**Bugs These Would Catch:**
- Session not starting
- Answers not recording
- Progress not saving
- Results not calculating
- Offline handling failures

---

### 5. Parent Features Tests ❌ **MEDIUM PRIORITY**

#### Missing Unit Tests:
- ❌ `ParentDashboard.test.ts` - Dashboard data aggregation
- ❌ `LinkChild.test.ts` - Child linking logic
- ❌ `Timeline.test.ts` - Timeline data loading

#### Missing Integration Tests:
- ❌ Parent → Link child → Verify linked
- ❌ Parent → View dashboard → Verify child data loaded
- ❌ Parent → View timeline → Verify events displayed

#### Missing E2E Tests:
- ❌ Parent → Link child → Verify child appears on dashboard
- ❌ Parent → Dashboard → View child progress → Verify displayed
- ❌ Parent → Timeline → View activity → Verify events shown

**Bugs These Would Catch:**
- Child linking failures
- Dashboard not loading child data
- Timeline not displaying events

---

### 6. Media Management Tests ❌ **MEDIUM PRIORITY**

#### Missing Unit Tests:
- ❌ `MediaLibrary.test.ts` - Media upload, retrieval
- ❌ `ImageGenerateButton.test.ts` - DALL-E image generation
- ❌ `mediaAdoption.test.ts` - Media adoption logic

#### Missing Integration Tests:
- ❌ Upload media → Verify stored in Supabase Storage
- ❌ Generate image → Verify DALL-E called → Verify image stored
- ❌ Adopt media → Verify linked to course

#### Missing E2E Tests:
- ❌ Admin → Media Manager → Upload image → Verify uploaded
- ❌ Admin → Course Editor → Generate image → Verify generated and linked
- ❌ Admin → Course Editor → Adopt media → Verify adopted

**Bugs These Would Catch:**
- Media upload failures
- Image generation failures
- Media not linking to courses
- Storage retrieval failures

---

### 7. Job Queue & Status Tests ❌ **HIGH PRIORITY**

#### Missing Unit Tests:
- ❌ `useJobContext.test.ts` - Job status tracking
- ❌ `useJobsList.test.ts` - Job listing and filtering
- ❌ `jobParser.test.ts` - Job result parsing

#### Missing Integration Tests:
- ❌ Create job → Verify job created → Verify status updates
- ❌ Job completes → Verify result stored → Verify status = 'done'
- ❌ Job fails → Verify error stored → Verify status = 'failed'

#### Missing E2E Tests:
- ❌ Admin → Create job → Monitor status → Verify status updates
- ❌ Admin → Job fails → View error → Verify error message displayed
- ❌ Admin → Job completes → View result → Verify result displayed

**Bugs These Would Catch:**
- Job status not updating
- Job results not stored
- Job errors not displayed
- Job polling failures

---

### 8. Form Validation Tests ❌ **MEDIUM PRIORITY**

#### Missing Unit Tests:
- ❌ `ItemEditor.validation.test.ts` - Item form validation
- ❌ `CourseEditor.validation.test.ts` - Course form validation
- ❌ `AssignmentEditor.validation.test.ts` - Assignment form validation

#### Missing Integration Tests:
- ❌ Submit invalid form → Verify validation errors shown
- ❌ Submit valid form → Verify saved successfully

#### Missing E2E Tests:
- ❌ Admin → Course Editor → Submit invalid item → Verify errors shown
- ❌ Admin → Course Editor → Fix errors → Submit → Verify saved

**Bugs These Would Catch:**
- Validation not working
- Invalid data saved
- Error messages not clear

---

### 9. Error Handling & User Feedback Tests ❌ **HIGH PRIORITY**

#### Missing Unit Tests:
- ❌ `toast.test.ts` - Toast message display
- ❌ `errorBoundary.test.ts` - Error boundary handling
- ❌ `PlayErrorBoundary.test.ts` - Play page error handling

#### Missing Integration Tests:
- ❌ API error → Verify user-friendly error message
- ❌ Network error → Verify retry logic
- ❌ 401 error → Verify redirect to login

#### Missing E2E Tests:
- ❌ Admin → Create course → API error → Verify error message shown
- ❌ Admin → Create course → Network error → Verify retry → Verify success
- ❌ Admin → Create course → 401 error → Verify redirect to login

**Bugs These Would Catch:**
- Errors not displayed
- Unclear error messages
- No retry logic
- Silent failures

---

### 10. Navigation & Routing Tests ❌ **MEDIUM PRIORITY**

#### Missing Unit Tests:
- ❌ `ProtectedRoute.test.ts` - Route protection logic
- ❌ `RoleNav.test.ts` - Role-based navigation

#### Missing Integration Tests:
- ❌ Unauthenticated → Access protected route → Verify redirect to /auth
- ❌ Student → Access admin route → Verify access denied

#### Missing E2E Tests:
- ❌ Guest → Try to access /admin → Verify redirect to /auth
- ❌ Student → Try to access /admin → Verify access denied
- ❌ Admin → Navigate between pages → Verify navigation works

**Bugs These Would Catch:**
- Protected routes not working
- Wrong redirects
- Navigation failures

---

### 11. Data Loading & Caching Tests ❌ **MEDIUM PRIORITY**

#### Missing Unit Tests:
- ❌ `useJobsList.test.ts` - Job list loading and caching
- ❌ `useJobContext.test.ts` - Job context loading
- ❌ `catalogCache.test.ts` - Catalog caching logic

#### Missing Integration Tests:
- ❌ Load data → Verify cached → Reload → Verify from cache
- ❌ Data updated → Verify cache invalidated → Reload → Verify fresh data

#### Missing E2E Tests:
- ❌ Admin → Load courses → Reload page → Verify fast load (from cache)
- ❌ Admin → Update course → Reload → Verify updated data shown

**Bugs These Would Catch:**
- Data not loading
- Cache not working
- Stale data displayed

---

### 12. Edge Cases & Error Scenarios ❌ **HIGH PRIORITY**

#### Missing Tests:
- ❌ Empty state handling (no courses, no jobs, no students)
- ❌ Loading state handling (spinners, skeletons)
- ❌ Offline handling (network disconnect, reconnect)
- ❌ Large data handling (1000+ courses, 100+ jobs)
- ❌ Concurrent operations (multiple users editing same course)
- ❌ Timeout handling (long-running operations)
- ❌ Rate limiting (too many requests)

**Bugs These Would Catch:**
- Empty states not displaying
- Loading states not showing
- Offline handling failures
- Performance issues
- Race conditions
- Timeout failures

---

## Test Coverage by Component

### Pages Missing Tests:
- ❌ `src/pages/admin/CourseEditor.tsx` - **CRITICAL**
- ❌ `src/pages/admin/AIPipelineV2.tsx` - **CRITICAL** (partial coverage)
- ❌ `src/pages/admin/JobsDashboard.tsx`
- ❌ `src/pages/admin/Metrics.tsx`
- ❌ `src/pages/admin/TagApprovalQueue.tsx`
- ❌ `src/pages/teacher/TeacherDashboard.tsx`
- ❌ `src/pages/teacher/Assignments.tsx`
- ❌ `src/pages/teacher/ClassProgress.tsx`
- ❌ `src/pages/student/Dashboard.tsx`
- ❌ `src/pages/student/Assignments.tsx`
- ❌ `src/pages/Play.tsx` - **CRITICAL**
- ❌ `src/pages/Results.tsx`
- ❌ `src/pages/parent/Dashboard.tsx`
- ❌ `src/pages/parent/LinkChild.tsx`

### Hooks Missing Tests:
- ❌ `src/hooks/useMCP.ts` - **CRITICAL** (partial coverage)
- ❌ `src/hooks/useAuth.ts` - **CRITICAL**
- ❌ `src/hooks/useJobContext.ts`
- ❌ `src/hooks/useJobsList.ts`
- ❌ `src/hooks/useGameSession.ts` - **CRITICAL**
- ❌ `src/hooks/useJobQuota.ts`
- ❌ `src/pages/admin/editor/hooks/useCoursePublishing.ts`
- ❌ `src/pages/admin/editor/hooks/useCourseVariants.ts`
- ❌ `src/pages/admin/editor/hooks/useCourseCoPilot.ts`

### Components Missing Tests:
- ❌ `src/components/admin/ItemEditor.tsx` - **CRITICAL**
- ❌ `src/components/admin/CourseEditor.tsx` components
- ❌ `src/components/game/*` - **CRITICAL**
- ❌ `src/components/layout/Header.tsx`
- ❌ `src/components/layout/HamburgerMenu.tsx`
- ❌ `src/components/admin/pipeline/*` - **CRITICAL**

---

## Priority Ranking

### 🔴 **CRITICAL** (Must Have - Prevents Most Manual Testing)
1. Course Editor Tests (save, publish, delete, variants, co-pilot)
2. Authentication & Session Tests (login, logout, refresh, organization_id)
3. Student Journey Tests (play, answer, complete, results)
4. Job Queue Tests (status, results, errors)
5. Error Handling Tests (user feedback, retry logic)

### 🟡 **HIGH** (Should Have - Prevents Common Bugs)
6. useMCP Hook Tests (all methods, error handling)
7. useAuth Hook Tests (session management)
8. useGameSession Tests (game state)
9. Navigation Tests (routes, redirects, protected routes)
10. Form Validation Tests (all forms)

### 🟢 **MEDIUM** (Nice to Have - Prevents Edge Cases)
11. Teacher Features Tests
12. Parent Features Tests
13. Media Management Tests
14. Data Loading & Caching Tests
15. Edge Cases Tests

---

## Recommended Test Implementation Order

### Phase 1: Critical Paths (Week 1)
1. ✅ Course Editor save/publish/delete (E2E)
2. ✅ Authentication flow (E2E)
3. ✅ Student play flow (E2E)
4. ✅ Job status tracking (Integration)

### Phase 2: Core Features (Week 2)
5. ✅ useMCP hook (Unit + Integration)
6. ✅ useAuth hook (Unit + Integration)
7. ✅ Form validation (Unit + E2E)
8. ✅ Error handling (Unit + Integration)

### Phase 3: Supporting Features (Week 3)
9. ✅ Teacher features (E2E)
10. ✅ Parent features (E2E)
11. ✅ Media management (Integration + E2E)
12. ✅ Edge cases (E2E)

---

## Test Coverage Goals

### Current Coverage:
- Unit Tests: ~30% (game logic, utilities, contracts)
- Integration Tests: ~10% (MCP validation, route validation)
- E2E Tests: ~15% (course creation, admin jobs)

### Target Coverage:
- Unit Tests: **80%** (all hooks, utilities, validation)
- Integration Tests: **60%** (all API calls, Edge Functions)
- E2E Tests: **50%** (all critical user journeys)

---

## Quick Wins (Easy Tests That Catch Many Bugs)

1. **Form Validation Tests** (2-3 hours)
   - Test all form validations
   - Catch invalid data bugs early

2. **Error Message Tests** (1-2 hours)
   - Test all error scenarios
   - Verify user-friendly messages

3. **Navigation Tests** (2-3 hours)
   - Test all routes
   - Catch 404 bugs

4. **Session Management Tests** (2-3 hours)
   - Test login/logout/refresh
   - Catch 401 bugs

5. **Empty State Tests** (1-2 hours)
   - Test all empty states
   - Catch UI bugs

**Total: ~10-15 hours for quick wins that catch 50%+ of bugs**

---

## Summary

**Missing Tests:**
- 🔴 **Critical:** 15 test suites
- 🟡 **High:** 10 test suites
- 🟢 **Medium:** 10 test suites

**Total Missing:** ~35 test suites covering:
- All major user journeys
- All critical features
- All error scenarios
- All edge cases

**Estimated Effort:**
- Quick wins: 10-15 hours (catches 50%+ bugs)
- Phase 1: 40-60 hours (catches 80%+ bugs)
- Full coverage: 100-150 hours (catches 95%+ bugs)

**Recommendation:** Start with Phase 1 critical paths to eliminate most manual testing.

