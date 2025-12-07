# E2E Testing Status & CI/CD Integration

## Overview
Comprehensive E2E test suite with **live Supabase and LLM calls** - no mocks! Tests run automatically in CI/CD to catch bugs before merge.

## Test Coverage

### ✅ Phase 1: Critical Priority (Implemented)
1. **Student Play Session** - Complete flow, persistence, network handling
2. **Course Editor Workflows** - Save, publish, archive, delete
3. **Media Management** - Upload, DALL-E generation, file validation
4. **Real-time Job Updates** - Status changes, progress, events

### ✅ Phase 2: High Priority (Implemented)
5. **Course Editor LLM Features** - Rewrite, variants audit, co-pilot
6. **Form Validation** - Course creation, assignment creation, state persistence
7. **Role-based Access Control** - Admin/teacher/student route access
8. **Catalog Updates** - Course appearance, realtime updates, refresh
9. **Session Persistence** - Auto-save, recovery, form state
10. **Error Recovery** - Retry logic, user-friendly errors, session refresh

## Test Results

### Current Status
- **Total Tests:** 81
- **Passing:** ~60+
- **Failing:** ~15
- **Skipped:** ~6

### Common Issues
- Some tests skip when no courses exist (expected)
- Some tests require specific UI elements (may need updates)
- Network timeouts on slow LLM calls (expected, tests have long timeouts)

## CI/CD Integration

### GitHub Actions Workflows

#### 1. `ci-e2e.yml` - E2E Tests
**Triggers:**
- Push to `main` (when `src/**` or `tests/e2e/**` change)
- Pull requests to `main`
- Manual dispatch

**Runs:**
- All live E2E tests (`npm run e2e:live`)
- Uses real Supabase and LLM APIs
- Uploads test reports and videos on failure

**Secrets Required:**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (optional)
- `ANTHROPIC_API_KEY` (optional)
- `E2E_ADMIN_EMAIL` (optional, defaults to `admin@learnplay.dev`)
- `E2E_ADMIN_PASSWORD` (optional, defaults to `AdminPass123!`)

**Skips if:** Secrets are missing (for forks)

#### 2. `ci-jest.yml` - Unit & Integration Tests
**Triggers:**
- Push to `main` (when `src/**` or `tests/unit/**` or `tests/integration/**` change)
- Pull requests to `main`
- Manual dispatch

**Runs:**
- Type checking
- Jest unit tests
- Coverage enforcement (90%+ lines/funcs, 88%+ statements, 70%+ branches)

**Optimized:** Only runs when relevant files change

## Running Tests Locally

### All E2E Tests
```bash
npm run e2e:live
```

### Specific Test File
```bash
npx playwright test tests/e2e/live-course-editor-llm.spec.ts --config=playwright.live.config.ts
```

### With Browser UI (Debugging)
```bash
HEADED=1 npm run e2e:live
```

### View Test Report
```bash
npm run e2e:live:report
```

## Test Files

### Phase 1 (Critical)
- `tests/e2e/live-student-play-session.spec.ts`
- `tests/e2e/live-course-editor-workflows.spec.ts`
- `tests/e2e/live-media-management.spec.ts`
- `tests/e2e/live-job-realtime-updates.spec.ts`

### Phase 2 (High Priority)
- `tests/e2e/live-course-editor-llm.spec.ts`
- `tests/e2e/live-form-validation.spec.ts`
- `tests/e2e/live-rbac.spec.ts`
- `tests/e2e/live-catalog-updates.spec.ts`
- `tests/e2e/live-session-persistence.spec.ts`
- `tests/e2e/live-error-recovery.spec.ts`

### Existing Tests
- `tests/e2e/live-ai-pipeline.spec.ts` - AI pipeline full flow
- `tests/e2e/live-admin-jobs.spec.ts` - Admin job creation
- `tests/e2e/live-course-navigation.spec.ts` - Course navigation
- `tests/e2e/live-edge-function-errors.spec.ts` - Error handling
- `tests/e2e/live-api-integration.spec.ts` - API integration
- `tests/e2e/live-course-management.spec.ts` - Course management
- `tests/e2e/live-student-journey.spec.ts` - Student journey
- `tests/e2e/live-teacher-features.spec.ts` - Teacher features
- `tests/e2e/live-system-health.spec.ts` - System health

## Bugs Caught by Tests

### Recent Bugs Fixed
1. ✅ **Wrong Route Bug** - Navigation to `/admin/courses/:courseId` instead of `/admin/editor/:courseId`
2. ✅ **Missing CourseId Bug** - CourseId was null or `ai_course_generate` (job type)
3. ✅ **Persistence Bug** - CourseId lost on page reload
4. ✅ **401 Error Bug** - Authentication errors not handled gracefully
5. ✅ **OpenAI Key Missing** - Edge function secrets not set
6. ✅ **CORS Errors** - Not handled gracefully in preview environments
7. ✅ **Edge Function Errors** - Missing parameters (studentId, etc.)

### Ongoing Monitoring
- Session state persistence
- Real-time job updates
- Catalog cache invalidation
- Form validation
- Role-based access control
- Error recovery and retry logic

## Adding New Tests

### When You Find a Bug
1. **Write a test that reproduces it** (should fail)
2. **Fix the bug**
3. **Verify test passes**
4. **Add test to appropriate suite**

### Test Structure
```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('user can do something', async ({ page }) => {
    // Setup
    await page.goto('/path');
    
    // Action
    await page.click('button');
    
    // Verify
    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

## CI/CD Best Practices

### 1. Test Failures Block Merge
- E2E tests must pass before merging to `main`
- Review test reports in GitHub Actions
- Fix failing tests before requesting review

### 2. Test Reports
- HTML reports uploaded on every run
- Videos uploaded on failure
- Reports available for 30 days

### 3. Performance
- Tests run in parallel (4 workers)
- Long-running tests have extended timeouts (5-10 minutes)
- Network requests have retry logic

### 4. Secrets Management
- All secrets stored in GitHub Secrets
- Tests skip gracefully if secrets missing
- No secrets in code or logs

## Next Steps

### Phase 3: Nice to Have
- Teacher assignment flow tests
- Parent dashboard tests
- Search & filter tests
- Performance & load tests

### Improvements
- Add more test fixtures (test courses, students, etc.)
- Improve test reliability (reduce flakiness)
- Add visual regression tests
- Add accessibility tests

## Resources

- **Test Documentation:** `docs/HIGH_VALUE_E2E_TESTS.md`
- **Test Scenarios:** `docs/E2E_TEST_SCENARIOS.md`
- **Playwright Config:** `playwright.live.config.ts`
- **CI Workflow:** `.github/workflows/ci-e2e.yml`

