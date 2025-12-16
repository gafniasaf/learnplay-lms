# Why Tests Pass But CTAs Fail: Testing Gap Analysis

## Executive Summary

**673 tests pass, but almost every CTA fails in production.** This document explains why.

## The Core Problem: Test Isolation vs. Real Integration

### 1. **E2E Tests Must Run Against Real APIs** ✅

```typescript
// playwright.config.ts line 22
command: 'npx cross-env VITE_USE_MOCK=false ... npm run build && npm run preview'
```

**Impact:**
- If E2E is configured with `VITE_USE_MOCK=true` (forbidden), tests will **never hit real Edge Functions**
- Parameter mismatches (like `{ role }` vs `{ parentId }`) are **not caught**
- CTA tests can verify buttons exist, but not that they actually work

**Example:**
```typescript
// CTA test verifies:
✅ Button exists
✅ Button is clickable
✅ Page doesn't crash

// But DOESN'T verify:
❌ Edge Function receives correct parameters
❌ Edge Function returns expected data
❌ UI updates with real data
```

### 2. **Unit Tests Mock Everything** ❌

**87 instances of `jest.mock`** across unit tests:

```typescript
// Typical unit test pattern:
jest.mock('@/hooks/useMCP', () => ({
  useMCP: () => ({ callGet: jest.fn().mockResolvedValue({}) })
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, loading: false })
}));
```

**Impact:**
- Tests verify **React can render strings**
- Tests verify **TypeScript compiles**
- Tests **DO NOT verify**:
  - Correct parameters passed to APIs
  - Real error handling
  - Auth flow integration
  - Edge Function contracts

### 3. **Contract Tests Were Missing** ❌ (Now Fixed)

**Before our fixes:**
- No contract tests for `useDashboard('parent')`
- No contract tests for `useDashboard('school')`
- No contract tests for `getCourseCatalog()`
- No contract tests for `useParentDashboard()`

**Result:** Bugs like passing `{ role }` instead of `{ parentId }` slipped through.

### 4. **CTA Coverage Tests Are Superficial** ⚠️

```typescript
// tests/e2e/cta-coverage.generated.spec.ts
test('cta-parent-dashboard-retry-error is clickable', async ({ page }) => {
  await page.goto('/parent/dashboard');
  const cta = page.locator('[data-cta-id="cta-parent-dashboard-retry-error"]');
  
  // ✅ Verifies button exists
  // ✅ Verifies button is clickable
  // ❌ DOESN'T verify the retry actually works
  // ❌ DOESN'T verify Edge Function is called correctly
  // ❌ DOESN'T verify error is actually fixed
});
```

**What They Test:**
- Button exists on page
- Button is not disabled
- Click doesn't crash page

**What They DON'T Test:**
- Edge Function receives correct parameters
- Edge Function returns expected response
- UI updates with real data
- Error states are handled correctly

## The Bugs We Found (That Tests Missed)

| Bug | Why Tests Missed It |
|-----|-------------------|
| `useDashboard('parent')` passes `{ role }` | Mock mode bypasses real API call |
| `useDashboard('school')` passes `{ role }` | Mock mode bypasses real API call |
| `getCourseCatalog()` calls non-existent Edge Function | Mock mode returns fake data |
| `useParentDashboard()` called without parentId | Mock mode bypasses validation |
| Dynamic import failures | E2E tests run against localhost, not Lovable |

## Test Pyramid Reality

```
         /\
        /  \  ← Unit Tests (673)
       /____\   87% mock everything
      /      \  Tests React rendering, not real behavior
     /        \
    /__________\  ← E2E Tests (Mock Mode)
   /            \  Never hit real APIs
  /              \
 /________________\  ← Real Integration Tests
                    Only 1 test suite (lovable-smoke.spec.ts)
                    Runs against production, but very limited
```

## Why This Happens

### 1. **Speed Over Accuracy**
- Mock mode = fast tests (no network calls)
- Real mode = slow tests (network latency)
- **Trade-off:** Fast tests that don't catch real bugs

### 2. **Test Coverage Metrics Are Misleading**
- "673 tests passing" sounds impressive
- But if 600+ tests mock everything, they test **nothing real**

### 3. **Missing Integration Layer**
- Unit tests: Test components in isolation ✅
- E2E tests: Test full flows ❌ (but in mock mode)
- **Missing:** Integration tests that verify Hook → MCP → Edge Function contracts

### 4. **CTA Tests Are Generated, Not Thoughtful**
- Auto-generated from `coverage.json`
- Verify existence, not functionality
- **Missing:** Verification that CTAs actually **do something**

## What We Fixed Today

### ✅ Contract Tests Added (30+ new tests)
- `useDashboard` - All roles now tested
- `useParentDashboard` - Parameter passing verified
- `useKnowledgeMap` - 7 methods tested
- `useClassManagement` - 8 methods tested
- `useCourseCatalog` - Static file fetch verified

### ✅ Code Fixes
- `useDashboard` now passes correct parameters for all roles
- `useParentDashboard` gets parentId from auth
- `getCourseCatalog` fetches from static file
- Vite build config fixed (removed Date.now() causing chunk mismatches)

## Recommendations

### 1. **Add Real Integration Tests** (Priority 1)

```typescript
// tests/integration/hooks-to-edge-functions.spec.ts
test('useDashboard("parent") calls parent-dashboard with parentId', async () => {
  // Use REAL Edge Function (not mock)
  const result = await testHookAgainstRealAPI('useDashboard', 'parent');
  expect(result.params).toEqual({ parentId: expect.any(String) });
  expect(result.params).not.toHaveProperty('role');
});
```

### 2. **Run E2E Tests Against Real APIs** (Priority 2)

Create a separate Playwright config:
```typescript
// playwright.config.live.ts
webServer: {
  command: 'npm run build && npm run preview', // NO VITE_USE_MOCK
  // Tests run against REAL Supabase
}
```

### 3. **Enhance CTA Tests** (Priority 3)

```typescript
test('cta-parent-dashboard-retry-error actually retries', async ({ page }) => {
  // 1. Trigger error state
  await mockEdgeFunctionError(page, 'parent-dashboard', 400);
  
  // 2. Click retry button
  await page.click('[data-cta-id="cta-parent-dashboard-retry-error"]');
  
  // 3. Verify Edge Function is called again
  await expectEdgeFunctionCalled(page, 'parent-dashboard', { parentId: expect.any(String) });
  
  // 4. Verify error is cleared
  await expect(page.locator('text=Unable to load')).not.toBeVisible();
});
```

### 4. **Add Smoke Tests for Every Role** (Priority 4)

```typescript
// tests/e2e/smoke-role-dashboards.spec.ts
test('Parent dashboard loads in LIVE mode', async ({ page }) => {
  await page.goto('/parent/dashboard');
  // Verify real data loads, not mock data
  await expect(page.locator('text=Children Linked')).toBeVisible();
});
```

## The Real Test Coverage

| Test Type | Count | What It Actually Tests |
|-----------|-------|------------------------|
| **Unit Tests (Mocked)** | ~600 | React rendering, TypeScript compilation |
| **Unit Tests (Real Logic)** | ~73 | Actual business logic (gameState, contracts, etc.) |
| **Contract Tests** | 87 | Parameter passing (NEW - we just added these) |
| **E2E Tests (Mock Mode)** | ~50 | UI renders, buttons exist |
| **E2E Tests (Live Mode)** | ~5 | Real API integration (very limited) |
| **Total** | 673 | **But only ~165 test real behavior** |

## Conclusion

**The tests pass because they test the wrong things:**
- ✅ Tests verify code compiles
- ✅ Tests verify React renders
- ✅ Tests verify buttons exist
- ❌ Tests DON'T verify APIs work
- ❌ Tests DON'T verify parameters are correct
- ❌ Tests DON'T verify real user flows

**The solution:** Add integration tests that verify the **full stack** works, not just that components render.

