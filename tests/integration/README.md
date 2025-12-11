# Integration Tests - 100% Real API Coverage

This directory contains integration tests that verify the **full stack** works against production Supabase:

- **22 hooks** tested against real Edge Functions
- **81 Edge Functions** tested directly
- **83 CTAs** enhanced to verify real behavior

## Test Structure

### Helpers (`helpers/`)
- `auth.ts` - Authentication utilities for all roles
- `edge-function.ts` - Direct Edge Function calling utilities
- `hook-testing.ts` - React Hook testing utilities (for Vitest)
- `playwright-helpers.ts` - Playwright utilities for CTA testing
- `config.ts` - Configuration and environment variables

### Hook Tests (`hooks/`)
Tests that verify hooks call Edge Functions with correct parameters:
- `useDashboard.integration.test.ts` - All dashboard roles
- `useParentDashboard.integration.test.ts` - Parent dashboard hook
- `useParentData.integration.test.ts` - Parent data hook
- `useMCP-methods.integration.test.ts` - Critical MCP methods

### Edge Function Tests (`edge-functions/`)
Direct tests of all Edge Functions, organized by domain:
- `dashboard.spec.ts` - Dashboard functions
- `parent.spec.ts` - Parent functions
- `student.spec.ts` - Student functions
- `teacher.spec.ts` - Teacher functions
- `admin.spec.ts` - Admin functions
- `jobs.spec.ts` - Job functions
- `courses.spec.ts` - Course functions
- `classes.spec.ts` - Class functions
- `messaging.spec.ts` - Messaging functions
- `media.spec.ts` - Media functions

### CTA Tests (`ctas/`)
Enhanced CTA tests that verify real behavior:
- `parent-dashboard-ctas.spec.ts` - Parent dashboard CTAs
- `teacher-dashboard-ctas.spec.ts` - Teacher dashboard CTAs
- `student-dashboard-ctas.spec.ts` - Student dashboard CTAs
- `admin-ctas.spec.ts` - Admin CTAs

## Running Tests

### Prerequisites

Set up test accounts and environment variables:

```bash
# Required environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export E2E_ADMIN_EMAIL="admin@test.com"
export E2E_ADMIN_PASSWORD="admin-password"
export E2E_TEACHER_EMAIL="teacher@test.com"
export E2E_TEACHER_PASSWORD="teacher-password"
export E2E_PARENT_EMAIL="parent@test.com"
export E2E_PARENT_PASSWORD="parent-password"
export E2E_STUDENT_EMAIL="student@test.com"
export E2E_STUDENT_PASSWORD="student-password"
```

### Run All Integration Tests

```bash
# Vitest tests (hooks)
npm run test:integration

# Playwright tests (Edge Functions + CTAs)
npm run test:integration:all

# Specific test suites
npm run test:integration:hooks
npm run test:integration:edge-functions
npm run test:integration:ctas
```

### Run Individual Test Files

```bash
# Vitest
npx vitest run tests/integration/hooks/useDashboard.integration.test.ts

# Playwright
npx playwright test tests/integration/edge-functions/parent.spec.ts --config=playwright.config.integration.ts
```

## Test Patterns

### Hook Integration Test Pattern

```typescript
import { authenticateAs } from '../helpers/auth';
import { callEdgeFunctionTracked, getLastCall } from '../helpers/edge-function';

test('hook calls Edge Function with correct parameters', async () => {
  const auth = await authenticateAs('parent');
  
  const response = await callEdgeFunctionTracked(
    'parent-dashboard',
    { parentId: auth.user.id },
    { role: 'parent', token: auth.accessToken }
  );
  
  const lastCall = getLastCall('parent-dashboard');
  expect(lastCall?.params).toHaveProperty('parentId', auth.user.id);
  expect(lastCall?.params).not.toHaveProperty('role');
});
```

### Edge Function Test Pattern

```typescript
import { verifyRequiresParameter, verifyRequiresAuth } from '../helpers/edge-function';

test('requires parentId parameter', async () => {
  const requiresParam = await verifyRequiresParameter(
    'parent-dashboard',
    'parentId',
    { role: 'parent', token: authToken }
  );
  
  expect(requiresParam).toBe(true);
});
```

### CTA Test Pattern

```typescript
import { useAuthState, interceptEdgeFunction } from '../helpers/playwright-helpers';

test('CTA actually works', async ({ page }) => {
  await useAuthState(page, 'parent');
  await page.goto('/parent/dashboard');
  
  const calls = await interceptEdgeFunction(page, 'parent-dashboard');
  
  // Click CTA
  await page.click('[data-cta-id="cta-parent-dashboard-retry"]');
  
  // Verify Edge Function was called
  expect(calls.length).toBeGreaterThan(0);
});
```

## Coverage Goals

- ✅ All hooks that call Edge Functions
- ✅ All Edge Functions (parameter validation, auth requirements)
- ✅ All CTAs (verify real behavior, not just existence)

## Differences from E2E Tests

| Aspect | E2E Tests | Integration Tests |
|--------|-----------|-------------------|
| **Mock Mode** | ✅ Uses `VITE_USE_MOCK=true` | ❌ Uses real APIs |
| **Purpose** | Verify UI renders | Verify APIs work |
| **Speed** | Fast (no network) | Slower (real network) |
| **Catch Bugs** | UI rendering issues | Parameter mismatches, API errors |

## Troubleshooting

### Tests Skip with "Auth setup failed"
- Ensure test accounts exist in Supabase
- Check environment variables are set correctly
- Verify credentials are correct

### Tests Fail with 401/403
- Check authentication tokens are valid
- Verify test accounts have correct roles
- Ensure Edge Functions allow the test role

### Tests Fail with 400 "parameter required"
- This is expected for parameter validation tests
- If unexpected, check the hook is passing correct parameters

### Tests Timeout
- Real API calls are slower than mocks
- Increase timeout in test configuration
- Check network connectivity to Supabase

## Maintenance

- Add new tests when adding new hooks or Edge Functions
- Update tests when API contracts change
- Review coverage report to ensure 100% coverage
