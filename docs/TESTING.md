# Testing Guide

This document describes the testing strategy and how to run tests for the EduPlay AI Course Generation system.

## Test Types

We have three types of tests, each serving different purposes:

### 1. Unit Tests (Jest)
**Location:** `tests/jest/`  
**Purpose:** Test individual components and utilities in isolation  
**Speed:** Fast (<10s)  
**Run:** `npm test`

Unit tests use mocks for external dependencies (Supabase, AI APIs) and verify that individual components work correctly.

### 2. Integration Tests (Vitest)
**Location:** `tests/integration/`  
**Purpose:** Test Edge Functions and end-to-end pipeline flows with real services  
**Speed:** Medium (1-3 minutes)  
**Run:** `npm run test:integration`

Integration tests call real Supabase Edge Functions and verify:
- Edge Function contracts (request/response formats)
- Cross-service communication
- Full pipeline flows (job creation → processing → catalog update)
- Error handling and retry logic

### 3. End-to-End Tests (Playwright)
**Location:** `tests/e2e/`  
**Purpose:** Test complete user workflows through the UI  
**Speed:** Slow (2-5 minutes)  
**Run:** `npm run e2e`

E2E tests simulate real user interactions and verify the UI behaves correctly.

---

## Running Tests

### Quick Commands

```bash
# Run all unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration

# Run integration tests in watch mode  
npm run test:integration:watch

# Run integration tests with UI
npm run test:integration:ui

# Run E2E tests
npm run e2e

# Run E2E tests in headed mode (see browser)
npm run e2e:headed

# Run full pipeline E2E test only
npm run e2e:full

# Run ALL tests (unit + integration + E2E)
npm run test:all
```

### Test-Specific Commands

```bash
# Run specific unit test file
npm test -- src/components/Button.test.tsx

# Run specific integration test
npx vitest run tests/integration/edge-functions.test.ts --config vitest.integration.config.ts

# Run specific E2E test
npx playwright test tests/e2e/course-generation-full.spec.ts
```

---

## Test Structure

### Unit Tests
```typescript
// tests/jest/components/Button.test.tsx
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
});
```

### Integration Tests
```typescript
// tests/integration/edge-functions.test.ts
import { describe, it, expect } from 'vitest';
import { callGenerateCourse } from './helpers';

describe('generate-course', () => {
  it('returns 422 when review fails', async () => {
    const response = await callGenerateCourse(
      { subject: 'test', gradeBand: 'K-2' },
      { 'x-test-force-review-fail': '1' } // Force failure
    );
    
    expect(response.status).toBe(422);
  }, 180000); // 3 minute timeout
});
```

### E2E Tests
```typescript
// tests/e2e/course-generation-full.spec.ts
import { test, expect } from '@playwright/test';

test('generates course through UI', async ({ page }) => {
  await page.goto('/admin/ai-pipeline');
  await page.fill('[data-testid="course-title"]', 'Test Course');
  await page.click('[data-testid="generate-course"]');
  
  await page.waitForSelector('text=/done|needs attention/i', { 
    timeout: 180000 
  });
});
```

---

## Test Helpers

### Integration Test Helpers
Located in `tests/integration/helpers.ts`:

```typescript
// Create a test job
const job = await createTestJob({
  subject: 'test-math',
  grade_band: 'K-2',
  mode: 'numeric'
});

// Wait for job to complete
const completedJob = await waitForJobStatus(
  job.id,
  ['done', 'needs_attention'],
  180000
);

// Clean up after test
await cleanupTestJob(job.id, job.course_id);

// Call Edge Function directly
const response = await callGenerateCourse({
  subject: 'test',
  gradeBand: 'K-2'
});

// Download course from storage
const course = await downloadCourse(courseId);

// Validate course schema
validateCourse(course);
```

---

## Test Hooks (Force-Fail Mechanisms)

Integration tests can force specific failure scenarios using HTTP headers:

### Force Review Failure
```typescript
const response = await callGenerateCourse(
  { subject: 'test', gradeBand: 'K-2' },
  { 'x-test-force-review-fail': '1' }
);
// Returns 422 with review scores below threshold
```

### Force Generation Failure
```typescript
const response = await callGenerateCourse(
  { subject: 'test', gradeBand: 'K-2' },
  { 'x-test-force-generation-fail': '1' }
);
// Returns 500 with internal error
```

These hooks are only active when the headers are present and allow testing error paths without actually failing AI generation.

---

## Key Test Scenarios

### Integration Tests Cover:

1. **Successful course generation**
   - Valid input → 200 response
   - Course matches schema
   - All required fields present

2. **Review failure handling**
   - Force review fail → 422 response
   - Job status set to `needs_attention`
   - Review scores recorded in database

3. **Input validation**
   - Empty subject → 400 error
   - Invalid mode → 400 error
   - Missing required fields → 400 error

4. **Pipeline flow**
   - Job creation → processing → catalog update
   - Job events logged correctly
   - Course saved to storage
   - Catalog entry created

5. **Concurrency**
   - Multiple jobs processed simultaneously
   - No race conditions

6. **Error recovery**
   - Retry logic for transient failures
   - Stuck job detection

### E2E Tests Cover:

1. **UI interactions**
   - Form submission
   - Real-time status updates
   - Phase progress indicators

2. **Review feedback display**
   - ReviewFeedback component shown for needs_attention
   - Scores displayed correctly

3. **Error handling**
   - Failed jobs show error messages
   - Network errors handled gracefully

---

## Writing New Tests

### Adding a Unit Test

1. Create file in `tests/jest/` matching source structure
2. Import component/utility
3. Use React Testing Library for components
4. Mock external dependencies

```typescript
// tests/jest/utils/myUtil.test.ts
import { myUtil } from '@/utils/myUtil';

describe('myUtil', () => {
  it('does something', () => {
    expect(myUtil('input')).toBe('expected output');
  });
});
```

### Adding an Integration Test

1. Add test to `tests/integration/edge-functions.test.ts` or `pipeline-flow.test.ts`
2. Use helpers from `helpers.ts`
3. Set appropriate timeouts (usually 180000ms = 3 minutes)
4. Clean up test data in `afterEach`

```typescript
describe('My Edge Function', () => {
  let testJobId: string | null = null;
  let testCourseId: string | null = null;

  afterEach(async () => {
    if (testJobId && testCourseId) {
      await cleanupTestJob(testJobId, testCourseId);
    }
  });

  it('does something', async () => {
    // Your test code
  }, 180000);
});
```

### Adding an E2E Test

1. Add test to `tests/e2e/course-generation-full.spec.ts`
2. Use Playwright API
3. Use `data-testid` attributes for element selection
4. Set appropriate timeouts for long operations

```typescript
test('my feature works', async ({ page }) => {
  await page.goto('/my-page');
  await page.click('[data-testid="my-button"]');
  await expect(page.locator('text=/success/i')).toBeVisible();
});
```

---

## Debugging Tests

### Unit Tests
```bash
# Run in watch mode with verbose output
npm run test:watch -- --verbose

# Run specific test file
npm test -- MyComponent.test.tsx
```

### Integration Tests
```bash
# Run with UI for interactive debugging
npm run test:integration:ui

# Run specific test with console logs visible
npx vitest run tests/integration/edge-functions.test.ts --config vitest.integration.config.ts --reporter=verbose
```

### E2E Tests
```bash
# Run in headed mode (see browser)
npm run e2e:headed

# Run with debug mode (pauses at failures)
npx playwright test --debug

# Generate trace for failed test
npx playwright test --trace on

# View trace
npx playwright show-trace trace.zip
```

---

## CI/CD

Tests run automatically on:
- Pull requests
- Pushes to main branch

### GitHub Actions Workflow
Located in `.github/workflows/test.yml` (to be created)

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test
      - run: npm run test:integration
      - run: npm run e2e
```

---

## Test Coverage

### Current Goals
- **Unit tests**: 80% coverage for business logic
- **Integration tests**: 100% coverage for critical paths (job processing, review handling)
- **E2E tests**: Cover primary user workflows

### Viewing Coverage
```bash
npm run test:coverage
```

Coverage report opens in browser showing:
- Files covered
- Line/branch/function coverage percentages
- Uncovered lines highlighted

---

## Troubleshooting

### "Job did not reach status within timeout"
**Cause:** Job processing took longer than expected  
**Solution:** Increase timeout or check if job is actually stuck

### "Failed to create test job"
**Cause:** Database connection issue or validation error  
**Solution:** Check `.env.local` has correct `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### "Course validation failed"
**Cause:** Generated course doesn't match schema  
**Solution:** Check Edge Function logs for generation errors

### Integration tests failing with network errors
**Cause:** Supabase project not accessible  
**Solution:** Verify Supabase project is running and API keys are correct

### E2E tests timing out
**Cause:** Application not loading or network issues  
**Solution:** Run `npm run dev` locally and verify app works before running E2E tests

---

## Best Practices

1. **Always clean up test data** - Use `afterEach` hooks
2. **Use appropriate timeouts** - 3 minutes for full generation, shorter for simple operations
3. **Prefix test data** - Use `test-` prefix for subjects/course IDs
4. **Test failure paths** - Use force-fail headers to test error handling
5. **Keep tests independent** - Don't rely on test execution order
6. **Use descriptive test names** - "returns 422 when review fails" not "test 1"
7. **Mock external services in unit tests** - Only call real services in integration tests
8. **Use data-testid for E2E** - More stable than CSS selectors or text matching

---

## Test Environment

Integration and E2E tests run against your main Supabase project (no separate test environment needed during development). This is safe because:
- Test jobs are prefixed with `test-`
- Test data is cleaned up automatically
- No production users yet

Once in production, consider:
- Using Supabase branching for tests
- Separate test project
- Running tests against staging environment

---

## FAQ

**Q: Why are integration tests so slow?**  
A: They call real AI models and process entire pipelines. Use force-fail headers to speed up error path testing.

**Q: Can I run integration tests locally?**  
A: Yes! Just ensure `.env.local` is configured with your Supabase credentials.

**Q: Do integration tests cost money (AI API calls)?**  
A: Yes, but minimal. Use force-fail headers to avoid actual AI calls when testing error paths.

**Q: Should I commit test data?**  
A: No. Tests create and clean up data automatically.

**Q: How do I skip a test temporarily?**  
A: Use `it.skip()` or `test.skip()` instead of `it()` or `test()`.

---

## Next Steps

- Set up CI/CD workflow (`.github/workflows/test.yml`)
- Add test coverage reporting
- Create separate test environment for production
- Add performance benchmarking tests
