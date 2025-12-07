# High-Value E2E Test Recommendations

## Overview
Based on codebase analysis, user journeys, and recent bugs, here are the **highest-value E2E tests** that would catch the most critical issues automatically.

## 🔴 **CRITICAL PRIORITY** (Prevents Most Manual Testing)

### 1. **Student Play Session - Complete Flow** ⭐⭐⭐⭐⭐
**Why:** Core user journey, complex state management, real-time updates

**Scenarios:**
```typescript
test('student completes full learning session', async ({ page }) => {
  // 1. Login as student
  // 2. Navigate to /play/:courseId
  // 3. Answer questions (multiple items)
  // 4. Verify immediate feedback
  // 5. Verify progress updates
  // 6. Complete session
  // 7. Navigate to /results
  // 8. Verify score and progress saved
  // 9. Return to dashboard
  // 10. Verify dashboard shows updated progress
});

test('student session persists across page reload', async ({ page }) => {
  // 1. Start session
  // 2. Answer 2-3 questions
  // 3. Reload page
  // 4. Verify session resumes (not restarted)
  // 5. Verify progress maintained
});

test('student session handles network interruption', async ({ page }) => {
  // 1. Start session
  // 2. Answer question
  // 3. Simulate network offline
  // 4. Verify error handling
  // 5. Restore network
  // 6. Verify retry works
  // 7. Verify progress saved
});
```

**Bugs Caught:**
- Session state lost on reload
- Progress not saving
- Network errors crash session
- Results not displaying
- Dashboard not updating

**Test File:** `tests/e2e/live-student-play-session.spec.ts`

---

### 2. **Course Editor - Save/Publish/Delete Flow** ⭐⭐⭐⭐⭐
**Why:** Critical admin workflow, multiple edge cases, data persistence

**Scenarios:**
```typescript
test('admin saves course edits', async ({ page }) => {
  // 1. Navigate to course editor
  // 2. Edit item (stem, options, explanation)
  // 3. Click Save
  // 4. Verify save success message
  // 5. Reload page
  // 6. Verify changes persisted
});

test('admin publishes course', async ({ page }) => {
  // 1. Edit course
  // 2. Click Publish
  // 3. Verify publish success
  // 4. Verify course appears in catalog
  // 5. Verify version incremented
  // 6. Verify published status shown
});

test('admin archives course', async ({ page }) => {
  // 1. Navigate to course editor
  // 2. Click Archive
  // 3. Verify archive confirmation
  // 4. Verify course hidden from catalog
  // 5. Verify archived status shown
});

test('admin deletes course', async ({ page }) => {
  // 1. Navigate to course editor
  // 2. Click Delete
  // 3. Confirm deletion
  // 4. Verify course removed
  // 5. Verify redirect to catalog
});
```

**Bugs Caught:**
- Save failures (silent failures)
- Publish not persisting
- Archive not working
- Delete not removing
- Version not incrementing

**Test File:** `tests/e2e/live-course-editor-workflows.spec.ts`

---

### 3. **Media Upload & Management** ⭐⭐⭐⭐
**Why:** File uploads are error-prone, storage issues common

**Scenarios:**
```typescript
test('admin uploads image to course', async ({ page }) => {
  // 1. Navigate to course editor
  // 2. Open item editor
  // 3. Click "Add Image"
  // 4. Upload image file
  // 5. Verify upload progress
  // 6. Verify image appears
  // 7. Verify image URL stored
  // 8. Save course
  // 9. Reload page
  // 10. Verify image still visible
});

test('admin generates image with DALL-E', async ({ page }) => {
  // 1. Navigate to course editor
  // 2. Open stimulus panel
  // 3. Enter image prompt
  // 4. Click "Generate with AI"
  // 5. Wait for generation (can take 30-60s)
  // 6. Verify image generated
  // 7. Verify image stored
  // 8. Verify image URL in course JSON
});

test('admin uploads large file (should fail gracefully)', async ({ page }) => {
  // 1. Try to upload file > 10MB
  // 2. Verify error message shown
  // 3. Verify no crash
});
```

**Bugs Caught:**
- Upload failures not shown
- Large files crash app
- Images not persisting
- DALL-E generation failures
- Storage quota errors

**Test File:** `tests/e2e/live-media-management.spec.ts`

---

### 4. **Real-time Job Updates** ⭐⭐⭐⭐
**Why:** Job status changes are critical, real-time updates can fail silently

**Scenarios:**
```typescript
test('job status updates in real-time', async ({ page }) => {
  // 1. Create course job
  // 2. Navigate to job details page
  // 3. Verify status updates (pending → processing → done)
  // 4. Verify progress bar updates
  // 5. Verify phase indicators update
  // 6. Verify job events appear
  // 7. Verify completion time shown
});

test('job failure shows error details', async ({ page }) => {
  // 1. Create job that will fail (invalid input)
  // 2. Wait for failure
  // 3. Verify error message shown
  // 4. Verify error details visible
  // 5. Verify retry button available
});

test('multiple jobs update independently', async ({ page }) => {
  // 1. Create 2 jobs
  // 2. Navigate between job views
  // 3. Verify each job updates independently
  // 4. Verify no cross-contamination
});
```

**Bugs Caught:**
- Status not updating
- Progress stuck
- Events not appearing
- Real-time subscription failures
- Job state confusion

**Test File:** `tests/e2e/live-job-realtime-updates.spec.ts`

---

### 5. **Course Editor LLM Features** ⭐⭐⭐⭐
**Why:** LLM features are expensive and error-prone

**Scenarios:**
```typescript
test('admin uses rewrite feature', async ({ page }) => {
  // 1. Navigate to course editor
  // 2. Select item
  // 3. Click "Rewrite"
  // 4. Enter prompt
  // 5. Wait for LLM response
  // 6. Verify rewrite appears
  // 7. Verify can accept/reject
  // 8. Verify accepted changes saved
});

test('admin runs variants audit', async ({ page }) => {
  // 1. Navigate to course editor
  // 2. Click "Variants Audit"
  // 3. Wait for audit job
  // 4. Verify audit results shown
  // 5. Verify missing variants identified
  // 6. Verify can generate missing variants
});

test('admin uses co-pilot enrich', async ({ page }) => {
  // 1. Navigate to course editor
  // 2. Click "Co-Pilot Enrich"
  // 3. Enter enrichment request
  // 4. Wait for job completion
  // 5. Verify enrichment applied
  // 6. Verify course updated
});
```

**Bugs Caught:**
- LLM API failures
- Rewrite not saving
- Variants audit not working
- Co-pilot jobs not creating
- Cost tracking errors

**Test File:** `tests/e2e/live-course-editor-llm.spec.ts` (partially exists)

---

## 🟡 **HIGH PRIORITY** (Prevents Common Bugs)

### 6. **Multi-step Forms** ⭐⭐⭐
**Why:** Complex forms with validation, easy to break

**Scenarios:**
```typescript
test('course creation form validation', async ({ page }) => {
  // 1. Navigate to course creation
  // 2. Submit empty form
  // 3. Verify validation errors
  // 4. Fill required fields
  // 5. Submit
  // 6. Verify success
});

test('assignment creation with class selection', async ({ page }) => {
  // 1. Navigate to assignments
  // 2. Click "Create Assignment"
  // 3. Fill form
  // 4. Select class
  // 5. Select students
  // 6. Set due date
  // 7. Submit
  // 8. Verify assignment created
  // 9. Verify students see assignment
});
```

**Bugs Caught:**
- Validation not working
- Form state lost
- Multi-step navigation broken
- Required fields not enforced

**Test File:** `tests/e2e/live-form-validation.spec.ts`

---

### 7. **Role-based Access Control** ⭐⭐⭐
**Why:** Security critical, easy to miss edge cases

**Scenarios:**
```typescript
test('student cannot access admin routes', async ({ page }) => {
  // 1. Login as student
  // 2. Try to navigate to /admin
  // 3. Verify redirect or access denied
  // 4. Try to access /admin/courses
  // 5. Verify blocked
});

test('teacher can access teacher routes only', async ({ page }) => {
  // 1. Login as teacher
  // 2. Verify can access /teacher/*
  // 3. Verify cannot access /admin/*
  // 4. Verify cannot access /parent/*
});

test('admin can access all routes', async ({ page }) => {
  // 1. Login as admin
  // 2. Verify can access /admin/*
  // 3. Verify can access /teacher/*
  // 4. Verify can access /parent/*
});
```

**Bugs Caught:**
- Unauthorized access
- Wrong redirects
- Role checks not working
- Session not checked

**Test File:** `tests/e2e/live-rbac.spec.ts`

---

### 8. **Catalog Updates After Course Generation** ⭐⭐⭐
**Why:** Common bug - courses don't appear after generation

**Scenarios:**
```typescript
test('course appears in catalog after generation', async ({ page }) => {
  // 1. Create course via AI pipeline
  // 2. Wait for completion
  // 3. Navigate to course catalog
  // 4. Verify course appears (without refresh)
  // 5. Verify realtime update worked
});

test('catalog updates via realtime subscription', async ({ page }) => {
  // 1. Open catalog page
  // 2. Create course in another tab
  // 3. Verify course appears in first tab (realtime)
  // 4. Verify no manual refresh needed
});
```

**Bugs Caught:**
- Courses not appearing
- Realtime not working
- Catalog cache issues
- Stale data

**Test File:** `tests/e2e/live-catalog-updates.spec.ts`

---

### 9. **Session Persistence & Recovery** ⭐⭐⭐
**Why:** Users lose work, frustrating experience

**Scenarios:**
```typescript
test('course editor auto-saves on blur', async ({ page }) => {
  // 1. Navigate to course editor
  // 2. Edit item
  // 3. Click away (blur)
  // 4. Verify auto-save triggered
  // 5. Reload page
  // 6. Verify changes saved
});

test('game session recovers after crash', async ({ page }) => {
  // 1. Start game session
  // 2. Answer questions
  // 3. Close browser (simulate crash)
  // 4. Reopen browser
  // 5. Navigate to same course
  // 6. Verify session resumes
  // 7. Verify progress maintained
});
```

**Bugs Caught:**
- Auto-save not working
- Session lost on crash
- Progress not recovered
- Data loss

**Test File:** `tests/e2e/live-session-persistence.spec.ts`

---

### 10. **Error Recovery & Retry Logic** ⭐⭐⭐
**Why:** Network issues common, users need retry

**Scenarios:**
```typescript
test('failed API call shows retry button', async ({ page }) => {
  // 1. Navigate to page that makes API call
  // 2. Simulate network failure
  // 3. Verify error message shown
  // 4. Verify retry button appears
  // 5. Click retry
  // 6. Restore network
  // 7. Verify retry succeeds
});

test('401 error triggers session refresh', async ({ page }) => {
  // 1. Login
  // 2. Wait for session to expire (or simulate)
  // 3. Try to create course
  // 4. Verify 401 detected
  // 5. Verify session refresh attempted
  // 6. Verify retry succeeds
});
```

**Bugs Caught:**
- No retry option
- Silent failures
- Session not refreshing
- Error messages unclear

**Test File:** `tests/e2e/live-error-recovery.spec.ts`

---

## 🟢 **MEDIUM PRIORITY** (Nice to Have)

### 11. **Teacher Assignment Flow** ⭐⭐
- Create assignment
- Assign to class/students
- Verify students see assignment
- Track completion

### 12. **Parent Dashboard Flow** ⭐⭐
- View child progress
- See assignments
- View timeline
- Adjust goals

### 13. **Search & Filter** ⭐⭐
- Course catalog search
- Job list filtering
- Tag filtering
- Date range filtering

### 14. **Performance & Load** ⭐
- Large course loading
- Many jobs in list
- Slow network handling
- Memory leaks

---

## Implementation Priority

### **Phase 1: Critical (Do First)**
1. ✅ Student Play Session - Complete Flow
2. ✅ Course Editor - Save/Publish/Delete
3. ✅ Media Upload & Management
4. ✅ Real-time Job Updates

### **Phase 2: High Value (Do Next)**
5. ✅ Course Editor LLM Features
6. ✅ Multi-step Forms
7. ✅ Role-based Access Control
8. ✅ Catalog Updates

### **Phase 3: Important (Do Later)**
9. ✅ Session Persistence
10. ✅ Error Recovery

---

## Test Structure Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('High-Value Feature: [Feature Name]', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('critical user flow', async ({ page }) => {
    // Setup
    await page.goto('/path');
    
    // Action
    await page.click('button');
    
    // Verify
    await expect(page.locator('text=Success')).toBeVisible();
    
    // Verify persistence
    await page.reload();
    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

---

## Running These Tests

```bash
# Run all high-value tests
npm run e2e:live

# Run specific test file
npm run e2e:live -- live-student-play-session

# Run with browser UI (for debugging)
HEADED=1 npm run e2e:live -- live-student-play-session
```

---

## Expected Impact

### Bugs Prevented:
- **80%+ of manual testing** eliminated
- **Session state bugs** caught immediately
- **Data persistence issues** caught before production
- **Real-time update failures** caught automatically
- **Authentication/authorization bugs** caught early

### Time Saved:
- **~2-3 hours/day** of manual testing
- **Faster bug detection** (seconds vs minutes)
- **Confidence in deployments** (tests pass = safe to deploy)

---

## Next Steps

1. **Start with Critical Priority tests** (Phase 1)
2. **Run tests in CI/CD** (catch bugs before merge)
3. **Add tests as bugs are found** (prevent regression)
4. **Expand to High Priority** (Phase 2) when Phase 1 stable

