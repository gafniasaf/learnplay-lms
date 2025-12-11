# Test Suite Audit

**Date:** 2025-12-11  
**Total Files:** ~180 test files  
**Question:** Are tests testing real functionality, or just passing?

---

## Test Categories

| Category | Symbol | What It Means |
|----------|--------|---------------|
| **REAL VALUE** | ✅ | Tests actual logic with meaningful assertions |
| **MOCK THEATER** | ⚠️ | Mocks everything, asserts component "renders" |
| **CONTRACT** | 🔗 | Validates data schemas/API contracts |
| **SMOKE** | 💨 | "Does it load without crashing" |
| **LIVE** | 🔴 | Tests against real APIs (costs $$$) |
| **SNAPSHOT** | 📷 | UI regression (fragile) |

---

## Summary by Directory

### `tests/unit/` - 35 files

| File | Category | Value | Notes |
|------|----------|-------|-------|
| `gameLogic.test.ts` | ✅ REAL | HIGH | Tests pure functions with real assertions |
| `gameState.test.ts` | ✅ REAL | HIGH | Tests Zustand store behavior |
| `gameState.safety.test.ts` | ✅ REAL | HIGH | Edge cases and safety checks |
| `contracts.test.ts` | 🔗 CONTRACT | HIGH | Validates Zod schemas |
| `contracts-validation.test.ts` | 🔗 CONTRACT | HIGH | Schema edge cases |
| `passwordStrength.test.ts` | ✅ REAL | MEDIUM | Pure function testing |
| `imageOptimizer.test.ts` | ✅ REAL | MEDIUM | Image processing logic |
| `mediaSizing.test.ts` | ✅ REAL | MEDIUM | Layout calculations |
| `jobParser.test.ts` | ✅ REAL | HIGH | Pipeline parsing |
| `pipeline-phaseExtractor.test.ts` | ✅ REAL | HIGH | Phase extraction logic |
| `pipeline-phaseSteps.test.ts` | ✅ REAL | HIGH | Step sequencing |
| `pipeline-logFormatter.test.ts` | ✅ REAL | MEDIUM | Log formatting |
| `utils-sanitizeHtml.test.ts` | ✅ REAL | HIGH | Security-critical |
| `validation.test.ts` | ✅ REAL | HIGH | Input validation |
| `useMCP.test.ts` | ⚠️ MOCK | LOW | Mocks all network, tests mock returns |
| `useMCP-auth.test.ts` | ⚠️ MOCK | LOW | Same issue |
| `useMCP-enqueueJob.test.ts` | ⚠️ MOCK | LOW | Same issue |

### `tests/unit/hooks/` - 10 files

| File | Category | Value | Notes |
|------|----------|-------|-------|
| `useJobStatus.test.tsx` | ⚠️ MOCK | LOW | Mocks useMCP, doesn't test real behavior |
| `useGameSession.test.tsx` | ⚠️ MOCK | LOW | Same - mocks everything |
| `useJobQuota.test.tsx` | ⚠️ MOCK | LOW | Same pattern |
| `useDashboard.contract.test.ts` | 🔗 CONTRACT | **HIGH** | **Catches param bugs!** |

### `src/pages/*/__tests__/` - 12 files

| File | Category | Value | Notes |
|------|----------|-------|-------|
| `Dashboard.test.tsx` (student) | ⚠️ MOCK | LOW | Mocks useDashboard completely |
| `Dashboard.test.tsx` (parent) | ⚠️ MOCK | LOW | Same pattern |
| `TeacherDashboard.test.tsx` | ⚠️ MOCK | LOW | Mocks everything |
| All page tests | ⚠️ MOCK | LOW | Only test "it renders with mock data" |

### `src/lib/tests/` - 45 files

| File | Category | Value | Notes |
|------|----------|-------|-------|
| `adaptive.*.test.ts` (8 files) | ✅ REAL | **CRITICAL** | Core game algorithm |
| `rotation.test.ts` | ✅ REAL | HIGH | Question rotation logic |
| `levelFilter.test.ts` | ✅ REAL | HIGH | Level filtering |
| `courseSchemaV2.test.ts` | 🔗 CONTRACT | HIGH | Course structure validation |
| `courseContract.test.ts` | 🔗 CONTRACT | HIGH | API contracts |
| `agent.generate.contract.test.ts` | 🔗 CONTRACT | HIGH | AI agent contracts |
| `agent.review.contract.test.ts` | 🔗 CONTRACT | HIGH | Review agent contracts |
| `edgeValidation.test.ts` | 🔗 CONTRACT | HIGH | Edge function contracts |
| `rlsRolesSmoke.test.ts` | 💨 SMOKE | MEDIUM | RLS policy checks |
| `catalogCache.test.ts` | ✅ REAL | HIGH | Caching logic |
| `storage.test.ts` | ✅ REAL | MEDIUM | Storage utilities |
| `embed.test.ts` | ✅ REAL | MEDIUM | Embed functionality |

### `tests/e2e/` - 60 files

| File Pattern | Category | Value | Notes |
|--------------|----------|-------|-------|
| `live-*.spec.ts` (18 files) | 🔴 LIVE | **CRITICAL** | Real API integration |
| `comprehensive-smoke.spec.ts` | 💨 SMOKE | HIGH | All routes load |
| `comprehensive-*.spec.ts` (10 files) | 💨 SMOKE | MEDIUM | Feature-area coverage |
| `auth-flow.spec.ts` | ✅ REAL | HIGH | Login/logout flow |
| `lovable-smoke.spec.ts` | 🔴 LIVE | **HIGH** | Deployment verification |
| `pre-release-smoke.spec.ts` | 💨 SMOKE | HIGH | Release gate |
| `critical-user-journeys.spec.ts` | ✅ REAL | HIGH | User flow testing |
| `cta-coverage.generated.spec.ts` | 💨 SMOKE | HIGH | CTA completeness |

### `tests/integration/` - 12 files

| File | Category | Value | Notes |
|------|----------|-------|-------|
| `mcp-health.spec.ts` | 🔴 LIVE | HIGH | MCP server health |
| `mcp-validation.spec.ts` | 🔗 CONTRACT | HIGH | MCP contract validation |
| `edge-function-errors.spec.ts` | ✅ REAL | HIGH | Error handling |
| `job-status.spec.ts` | 🔴 LIVE | MEDIUM | Job polling |

---

## Problems Found

### 1. **Page Component Tests = Mock Theater** ⚠️

All `src/pages/*/__tests__/*.test.tsx` files follow this pattern:

```typescript
// Mocks EVERYTHING
jest.mock('@/hooks/useDashboard', () => ({
  useDashboard: jest.fn(),
}));

// Returns fake data
mockUseDashboard.mockReturnValue({
  dashboard: { /* fake data */ },
  loading: false,
  error: null,
});

// Assertion: "it renders"
expect(await findByText('API Assignment')).toBeInTheDocument();
```

**Problem:** Never tests:
- That hooks call correct API endpoints
- That correct parameters are passed
- That data transformations work
- That error states are handled

**This is why the `useDashboard` bug slipped through.**

### 2. **Hook Tests = Mock the Hook Under Test**

```typescript
// From useJobStatus.test.tsx
jest.mock('@/hooks/useMCP', () => ({
  useMCP: jest.fn(),
}));

// Tests that mocked useMCP returns what we told it to return
expect(result.current.status).toBeNull();
```

**Problem:** We're testing that mocks work, not that the hook works.

### 3. **No Contract Tests for Hooks → Edge Functions**

The gap that caused the `studentId` bug:

```
Hook                    → MCP Method        → Edge Function
useDashboard('student') → callGet(...)      → student-dashboard
                        ↑
                        | NO TEST HERE
                        | (passed { role } instead of { studentId })
```

---

## Recommendations

### 1. **Add Hook Contract Tests** (like useDashboard.contract.test.ts)

For every hook that calls Edge Functions, verify:
- Correct endpoint is called
- Correct parameters are passed
- Required params are not missing

### 2. **Replace Page Component Tests with E2E**

Instead of:
```typescript
// Mocks everything
jest.mock('@/hooks/useDashboard');
it('renders with fake data');
```

Use Playwright:
```typescript
// Tests real component with real hooks
await page.goto('/student/dashboard');
await expect(page.locator('[data-testid="score"]')).toBeVisible();
```

### 3. **Keep These High-Value Tests**

| Priority | Tests |
|----------|-------|
| CRITICAL | `adaptive.*.test.ts`, `gameLogic.test.ts`, `contracts.test.ts` |
| HIGH | `live-*.spec.ts`, `lovable-smoke.spec.ts`, `*-contract.test.ts` |
| MEDIUM | `comprehensive-smoke.spec.ts`, integration tests |
| LOW | Page component tests (consider removing) |

### 4. **Tests to Consider Removing**

| File | Reason |
|------|--------|
| `src/pages/*/__tests__/*.test.tsx` | Mock theater - no real coverage |
| `tests/unit/hooks/use*.test.tsx` | Mock useMCP - doesn't test real behavior |
| Duplicate tests | Several tests exist in both `tests/` and `src/lib/tests/` |

---

## Metrics

| Category | Files | Real Value? |
|----------|-------|-------------|
| Pure logic tests | ~40 | ✅ YES |
| Contract tests | ~15 | ✅ YES |
| Live/E2E tests | ~25 | ✅ YES |
| Smoke tests | ~20 | ✅ YES |
| Mock theater | **~35** | ❌ NO |
| Snapshots | ~5 | ⚠️ FRAGILE |

**~35 test files (~20%) provide no real value and give false confidence.**

