# Adding Tests When Bugs Are Found

## Process: Test-Driven Bug Fixing

When you find a bug manually, follow this process to ensure it never comes back:

### Step 1: Write a Test That Reproduces the Bug

**Before fixing the bug**, write a test that demonstrates the bug:

```typescript
// tests/e2e/live-bug-reproduction.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Bug: [Brief Description]', () => {
  test.use({ storageState: 'playwright/.auth/admin.json' });

  test('reproduces the bug', async ({ page }) => {
    // Steps to reproduce the bug
    await page.goto('/path/to/feature');
    
    // Action that triggers the bug
    await page.click('button');
    
    // Assertion that SHOULD pass but currently FAILS (demonstrating the bug)
    await expect(page.locator('text=Expected Result')).toBeVisible();
    // This test will FAIL until the bug is fixed
  });
});
```

**Run the test** - it should FAIL (proving the bug exists):
```bash
npm run e2e:live -- live-bug-reproduction
```

### Step 2: Fix the Bug

Fix the bug in the codebase. Make sure your fix addresses the root cause.

### Step 3: Verify the Test Passes

Run the test again - it should now PASS:
```bash
npm run e2e:live -- live-bug-reproduction
```

### Step 4: Move Test to Appropriate Suite

Once the test passes, move it to the appropriate test file:

- **Course Editor bugs** → `tests/e2e/live-course-editor-workflows.spec.ts`
- **Navigation bugs** → `tests/e2e/live-course-navigation.spec.ts`
- **API/Error bugs** → `tests/e2e/live-api-integration.spec.ts`
- **Authentication bugs** → `tests/e2e/live-rbac.spec.ts`
- **Job/Queue bugs** → `tests/e2e/live-job-realtime-updates.spec.ts`
- **New feature bugs** → Create new file or add to existing suite

### Step 5: Document the Bug

Add a comment in the test explaining what bug it catches:

```typescript
test('courseId persists across page reloads', async ({ page }) => {
  // BUG FIXED: CourseId was lost on page reload, causing navigation failures
  // This test ensures courseId is stored in localStorage and persists
  
  // ... test code ...
});
```

## Test Template for Common Bug Types

### Bug Type: Wrong Route/Navigation

```typescript
test('navigates to correct route', async ({ page }) => {
  await page.goto('/source-page');
  await page.click('button:has-text("Navigate")');
  
  // Verify correct route (not wrong route)
  await expect(page).toHaveURL(/\/correct\/route\/[a-z0-9-]+/i);
  expect(page.url()).not.toMatch(/\/wrong\/route/);
});
```

### Bug Type: Missing Data/Persistence

```typescript
test('data persists across reload', async ({ page }) => {
  // Set data
  await page.fill('input', 'test-data');
  await page.click('button:has-text("Save")');
  
  // Reload
  await page.reload();
  
  // Verify data persisted
  const value = await page.locator('input').inputValue();
  expect(value).toBe('test-data');
});
```

### Bug Type: Error Handling

```typescript
test('handles errors gracefully', async ({ page }) => {
  // Trigger error condition
  await page.goto('/page');
  await page.click('button:has-text("Action")');
  
  // Verify user-friendly error (not raw API error)
  const error = page.locator('[role="alert"]');
  await expect(error).toBeVisible();
  
  const errorText = await error.textContent();
  expect(errorText).not.toContain('Access-Control-Allow-Origin');
  expect(errorText).not.toMatch(/^[0-9]{3}/); // Not just status code
  expect(errorText?.length).toBeGreaterThan(10); // Not just "Error"
});
```

### Bug Type: Authentication/Authorization

```typescript
test('requires authentication', async ({ page }) => {
  // Clear auth
  await page.context().clearCookies();
  
  // Try to access protected route
  await page.goto('/admin');
  
  // Should redirect to auth or show error
  await page.waitForTimeout(2000);
  const onAuthPage = page.url().includes('/auth');
  const hasError = await page.locator('text=/authentication|log in/i').isVisible({ timeout: 3000 }).catch(() => false);
  
  expect(onAuthPage || hasError).toBeTruthy();
});
```

### Bug Type: UI Element Not Found

```typescript
test('UI element is visible and functional', async ({ page }) => {
  await page.goto('/page');
  await page.waitForLoadState('networkidle');
  
  // Use specific selector (id, data-testid, or text)
  const element = page.locator('input#specific-id, [data-testid="specific-element"]');
  await expect(element).toBeVisible({ timeout: 10000 });
  
  // Verify it's functional
  await element.fill('test');
  await element.press('Enter');
  
  // Verify action completed
  await expect(page.locator('text=Success')).toBeVisible();
});
```

## Best Practices

### 1. Use Specific Selectors

**Bad:**
```typescript
const button = page.locator('button').first(); // Too generic
```

**Good:**
```typescript
const button = page.locator('button:has-text("Create Course")'); // Specific text
// OR
const button = page.locator('[data-testid="create-course-button"]'); // data-testid
// OR
const button = page.locator('button#create-course'); // ID
```

### 2. Wait for Elements

**Bad:**
```typescript
await page.click('button'); // Might not be loaded yet
```

**Good:**
```typescript
const button = page.locator('button:has-text("Create")');
await button.waitFor({ timeout: 10000 });
await button.click();
```

### 3. Handle Optional Elements

**Bad:**
```typescript
await page.click('button'); // Fails if button doesn't exist
```

**Good:**
```typescript
const button = page.locator('button:has-text("Optional")');
const hasButton = await button.isVisible({ timeout: 2000 }).catch(() => false);
if (hasButton) {
  await button.click();
}
```

### 4. Use Meaningful Test Names

**Bad:**
```typescript
test('test 1', async ({ page }) => { ... });
```

**Good:**
```typescript
test('courseId persists across page reloads', async ({ page }) => { ... });
```

### 5. Add Comments for Complex Tests

```typescript
test('complex workflow', async ({ page }) => {
  // Step 1: Navigate to page
  await page.goto('/admin/ai-pipeline');
  
  // Step 2: Fill form
  await page.fill('input#subject', 'Test');
  
  // Step 3: Submit
  await page.click('button:has-text("Generate")');
  
  // Step 4: Wait for completion
  await expect(page.locator('text=/complete/i')).toBeVisible({ timeout: 300000 });
  
  // Step 5: Verify result
  const courseId = await page.evaluate(() => localStorage.getItem('selectedCourseId'));
  expect(courseId).not.toBeNull();
});
```

## Common Test Patterns

### Pattern: Create → Wait → Verify

```typescript
test('creates and verifies item', async ({ page }) => {
  // Create
  await page.goto('/create-page');
  await page.fill('input', 'test');
  await page.click('button:has-text("Create")');
  
  // Wait for creation
  await expect(page.locator('text=/created|success/i')).toBeVisible({ timeout: 30000 });
  
  // Verify
  await page.goto('/list-page');
  await expect(page.locator('text=test')).toBeVisible();
});
```

### Pattern: Extract → Persist → Verify

```typescript
test('extracts and persists data', async ({ page }) => {
  // Extract data
  const data = await page.evaluate(() => {
    return localStorage.getItem('key');
  });
  
  // Reload
  await page.reload();
  
  // Verify persisted
  const persistedData = await page.evaluate(() => {
    return localStorage.getItem('key');
  });
  expect(persistedData).toBe(data);
});
```

### Pattern: Error → Retry → Success

```typescript
test('handles errors and retries', async ({ page, context }) => {
  // Simulate error
  await context.route('**/api/**', route => route.abort('failed'));
  
  // Trigger action
  await page.click('button');
  
  // Verify error shown
  await expect(page.locator('text=/error|failed/i')).toBeVisible();
  
  // Restore network
  await context.unroute('**/api/**');
  
  // Retry
  await page.click('button:has-text("Retry")');
  
  // Verify success
  await expect(page.locator('text=/success/i')).toBeVisible();
});
```

## Running Tests

### Run Single Test File
```bash
npm run e2e:live -- tests/e2e/live-bug-reproduction.spec.ts
```

### Run Single Test
```bash
npm run e2e:live -- -g "reproduces the bug"
```

### Run with Browser UI (Debugging)
```bash
HEADED=1 npm run e2e:live -- live-bug-reproduction
```

### View Test Report
```bash
npm run e2e:live:report
```

## CI/CD Integration

Tests are automatically run in CI/CD on every push to `main`. If a test fails:

1. **Check the test report** in GitHub Actions
2. **Review the error message** and screenshot
3. **Fix the bug** or update the test if it's a false positive
4. **Verify locally** before pushing again

## Resources

- **Test Documentation:** `docs/HIGH_VALUE_E2E_TESTS.md`
- **Test Status:** `docs/E2E_TESTING_STATUS.md`
- **Playwright Docs:** https://playwright.dev/docs/intro
- **Example Tests:** `tests/e2e/live-*.spec.ts`


