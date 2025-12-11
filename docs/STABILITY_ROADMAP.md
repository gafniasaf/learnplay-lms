# 🎯 Stability Roadmap: AI-Managed Fully Tested System

## Current State
- ❌ CTAs exist but many are untested
- ❌ Error states are often silent
- ❌ Tests pass but manual testing breaks
- ❌ Backend failures cause blank screens

## Target State
- ✅ Every CTA has `data-cta-id` and is tracked
- ✅ Every CTA has a test that clicks it and verifies outcome
- ✅ Every error shows visible UI feedback (toast, banner, message)
- ✅ Backend health is verified before tests run
- ✅ CI blocks deployment if coverage drops

---

## Phase 1: CTA Audit & Tracking (Day 1)

### 1.1 Run CTA Coverage Check
```bash
npm run verify:cta
```

### 1.2 Fix Untracked CTAs
Every interactive element needs:
```tsx
<Button 
  data-cta-id="cta-{page}-{action}"
  data-action="action"  // or "navigate"
  onClick={...}
>
```

### 1.3 Generate CTA Manifest
Create `docs/cta-manifest.json` with every CTA and its expected behavior:
```json
{
  "cta-ai-pipeline-generate": {
    "page": "/admin/ai-pipeline",
    "action": "Enqueue course generation job",
    "expected": "Toast success + redirect to job view OR error toast",
    "requires_auth": true,
    "requires_data": ["subject filled"]
  }
}
```

---

## Phase 2: Error Visibility Audit (Day 1-2)

### 2.1 Every API Call Must Surface Errors

**Pattern to enforce:**
```tsx
// ❌ BAD - Silent failure
const { data } = useQuery(...);

// ✅ GOOD - Visible error
const { data, error } = useQuery(...);
useEffect(() => {
  if (error) toast.error('Failed to load', { description: error.message });
}, [error]);
```

### 2.2 Create Error Boundary Audit Script
```bash
npm run audit:error-visibility
```

Checks:
- Every `useQuery` / `useMutation` destructures `error`
- Every `error` has a corresponding toast/UI
- No `catch(() => {})` swallowing errors

### 2.3 Add Global Error Handler
```tsx
// In App.tsx or similar
window.addEventListener('unhandledrejection', (event) => {
  toast.error('Unexpected error', { description: event.reason?.message });
  Sentry.captureException(event.reason);
});
```

---

## Phase 3: Backend Health Gate (Day 2)

### 3.1 Health Check Before Tests
```typescript
// tests/e2e/health-gate.setup.ts
test('backend is healthy before running tests', async ({ request }) => {
  const response = await request.get(`${SUPABASE_URL}/functions/v1/health`);
  expect(response.ok()).toBeTruthy();
  
  // Check critical functions
  const functions = ['list-course-jobs', 'enqueue-job', 'get-course'];
  for (const fn of functions) {
    const r = await request.options(`${SUPABASE_URL}/functions/v1/${fn}`);
    expect(r.status()).not.toBe(503); // 503 = function crashed
  }
});
```

### 3.2 Health Check in UI
Show banner when backend is down:
```tsx
const { data: health, error } = useQuery(['health'], checkBackendHealth);

if (error) {
  return <Banner variant="destructive">Backend unavailable. Please try again later.</Banner>;
}
```

---

## Phase 4: CTA-Driven Test Generation (Day 2-3)

### 4.1 Generate Tests from CTA Manifest
```bash
npm run generate:cta-tests
```

Creates a test for EVERY CTA:
```typescript
// tests/e2e/cta-coverage.spec.ts (auto-generated)
test.describe('CTA Coverage', () => {
  test('cta-ai-pipeline-generate works', async ({ page }) => {
    await page.goto('/admin/ai-pipeline');
    
    // Setup required state
    await page.fill('[data-field="subject"]', 'Test Subject');
    
    // Click the CTA
    await page.click('[data-cta-id="cta-ai-pipeline-generate"]');
    
    // Verify outcome (success OR visible error)
    await expect(
      page.locator('[data-sonner-toast]').or(page.locator('text=/error|success/i'))
    ).toBeVisible({ timeout: 10000 });
  });
});
```

### 4.2 Test Categories
Every CTA test must verify ONE of:
1. **Success path** - Action completes, success feedback shown
2. **Validation error** - Missing required data, error shown
3. **Backend error** - 500/timeout, error toast shown
4. **Auth required** - Redirect to login or auth error shown

---

## Phase 5: State Management Hardening (Day 3)

### 5.1 No Stale State
- Clear localStorage on logout
- Validate stored IDs before using them
- Add `?new=1` param support to all pages that restore state

### 5.2 No Undefined Access
Run TypeScript strict mode:
```json
{
  "compilerOptions": {
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### 5.3 Defensive Data Access
```typescript
// ❌ BAD
{data.items.map(...)}

// ✅ GOOD  
{(data?.items ?? []).map(...)}
```

---

## Phase 6: CI Pipeline (Day 3-4)

### 6.1 Pre-merge Checks
```yaml
# .github/workflows/ci.yml
jobs:
  test:
    steps:
      - run: npm run typecheck
      - run: npm run verify:cta:strict  # Fail if CTA coverage < 100%
      - run: npm run test
      - run: npm run e2e -- --project=health-gate  # Backend health first
      - run: npm run e2e -- --project=cta-coverage  # Then CTA tests
```

### 6.2 Deployment Gate
```yaml
deploy:
  needs: [test]
  if: ${{ success() }}  # Only deploy if all tests pass
```

---

## Phase 7: Monitoring & Alerts (Ongoing)

### 7.1 Sentry for Runtime Errors
Already configured - ensure it catches:
- Unhandled promise rejections
- React error boundaries
- Failed API calls

### 7.2 Uptime Monitoring
Use Supabase's built-in monitoring or add:
- Pingdom/UptimeRobot for edge function health
- Alerts on 5xx error rate spike

---

## Definition of Done

Before manual testing:

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| TypeScript | `npm run typecheck` | 0 errors |
| CTA Coverage | `npm run verify:cta:strict` | 100% tracked |
| Unit Tests | `npm run test` | All pass |
| Backend Health | `npm run e2e -- -g "health"` | All functions respond |
| CTA Tests | `npm run e2e -- -g "CTA"` | Every CTA works or shows error |
| Error Visibility | `npm run audit:error-visibility` | No silent failures |

---

## Quick Start: Run This Now

```bash
# 1. Check current CTA coverage
npm run verify:cta

# 2. Run health check
npx tsx scripts/verify-live-deployment.ts

# 3. Run real-world failure tests
npx playwright test tests/e2e/real-world-failures.spec.ts --config=playwright.debug.config.ts

# 4. Fix what fails, repeat
```

---

## Files to Create

1. `scripts/audit-error-visibility.ts` - Finds silent error handling
2. `scripts/generate-cta-tests.ts` - Auto-generates tests from CTAs
3. `tests/e2e/health-gate.setup.ts` - Backend health verification
4. `tests/e2e/cta-coverage.spec.ts` - Auto-generated CTA tests
5. `docs/cta-manifest.json` - CTA behavior documentation


