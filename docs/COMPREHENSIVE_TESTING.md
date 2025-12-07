# Comprehensive Testing Strategy

## Overview
This document outlines ALL test types and scenarios that catch bugs automatically, eliminating the need for manual testing.

## Test Pyramid

```
        /\
       /E2E\        ← Live Supabase + Live LLM (catches integration bugs)
      /------\
     /Integration\  ← Real Edge Functions (catches API bugs)
    /------------\
   /   Unit Tests  \ ← Fast, isolated (catches logic bugs)
  /----------------\
```

## Test Types

### 1. Unit Tests (Jest) - Fast, Isolated
**Location:** `tests/unit/`
**Run:** `npm test`
**Speed:** <10 seconds
**Purpose:** Test individual functions and logic

**Coverage:**
- ✅ CourseId extraction logic (`courseIdExtraction.test.ts`)
- ✅ Route generation (`api-common-route.test.ts`)
- ✅ useMCP hook error handling (`useMCP-enqueueJob.test.ts`)
- ✅ Contracts validation (`contracts-validation.test.ts`)
- ✅ Game logic, validation, utilities

**Bugs Caught:**
- CourseId extraction failures
- Wrong route patterns
- Invalid courseId formats
- Contract mismatches

### 2. Integration Tests (Vitest) - Real Edge Functions
**Location:** `tests/integration/`
**Run:** `npm run test:integration`
**Speed:** 1-3 minutes
**Purpose:** Test Edge Functions with real Supabase

**Coverage:**
- ✅ CourseId storage and extraction (`courseId-storage.spec.ts`)
- ✅ Route validation (`route-validation.spec.ts`)
- ✅ MCP method validation (`mcp-validation.spec.ts`)
- ✅ MCP contract validation (`mcp-contract-validation.spec.ts`)
- ✅ Navigation flow (`navigation-flow.spec.ts`)
- ✅ API error handling (`api-error-handling.spec.ts`)

**Bugs Caught:**
- CourseId not stored in job
- Wrong routes
- MCP method mismatches
- Contract violations

### 3. E2E Tests (Playwright) - Full Browser + Live Services
**Location:** `tests/e2e/`
**Run:** `npm run e2e:live`
**Speed:** 5-10 minutes
**Purpose:** Test complete user flows with REAL Supabase + REAL LLM

**Coverage:**
- ✅ Course creation → Navigation → Editor (`live-course-navigation.spec.ts`)
- ✅ Full AI pipeline with LLM (`live-ai-pipeline.spec.ts`)
- ✅ Admin job creation (`live-admin-jobs.spec.ts`)
- ✅ Course management (`live-course-management.spec.ts`)
- ✅ API integration (`live-api-integration.spec.ts`)

**Bugs Caught:**
- **ALL the bugs we've been fixing manually!**
- Wrong routes (404 errors)
- Missing courseId
- Navigation failures
- 401 errors
- LLM failures
- Storage issues

## Test Scenarios That Catch Real Bugs

### Course Creation → Preview Flow
**Test:** `live-course-navigation.spec.ts`
**Bugs Caught:**
- ✅ Wrong route (`/admin/courses` vs `/admin/editor`)
- ✅ Missing courseId
- ✅ courseId = `ai_course_generate` (job type)
- ✅ courseId lost on reload
- ✅ 404 on course preview

### CourseId Extraction
**Test:** `courseIdExtraction.test.ts` + `courseId-storage.spec.ts`
**Bugs Caught:**
- ✅ courseId not extracted from job object
- ✅ courseId not extracted from payload
- ✅ courseId not extracted from result_path
- ✅ Job type used as courseId

### Route Validation
**Test:** `route-validation.spec.ts` + `api-common-route.test.ts`
**Bugs Caught:**
- ✅ Wrong route patterns
- ✅ Invalid courseId in route
- ✅ Route generation bugs

### MCP Validation
**Test:** `mcp-validation.spec.ts` + `mcp-contract-validation.spec.ts`
**Bugs Caught:**
- ✅ Invalid MCP method names
- ✅ Contract mismatches
- ✅ Parameter validation failures
- ✅ Response schema mismatches

### Error Handling
**Test:** `useMCP-enqueueJob.test.ts` + `api-error-handling.spec.ts`
**Bugs Caught:**
- ✅ 401 errors not handled
- ✅ Missing organization_id errors
- ✅ Guest mode errors
- ✅ CORS errors
- ✅ Unclear error messages

## Running Tests

### All Tests
```bash
# Unit tests (fast)
npm test

# Integration tests (medium)
npm run test:integration

# E2E tests (slow, but catches everything)
npm run e2e:live

# Everything
npm run test:all
```

### Specific Test Suites
```bash
# Just courseId tests
npm test -- courseIdExtraction
npx vitest run tests/integration/courseId-storage.spec.ts
npx playwright test tests/e2e/live-course-navigation.spec.ts

# Just route tests
npm test -- route
npx vitest run tests/integration/route-validation.spec.ts

# Just MCP tests
npx vitest run tests/integration/mcp-validation.spec.ts
```

### With Debugging
```bash
# Jest with watch mode
npm test -- --watch

# Vitest with UI
npm run test:integration:ui

# Playwright with browser visible
HEADED=1 npm run e2e:live
```

## What Each Test Type Catches

| Bug Type | Unit Tests | Integration Tests | E2E Tests |
|----------|------------|-------------------|-----------|
| **Logic bugs** (courseId extraction) | ✅ | ✅ | ✅ |
| **Route bugs** (wrong paths) | ✅ | ✅ | ✅ |
| **API bugs** (401, CORS) | ⚠️ | ✅ | ✅ |
| **Navigation bugs** (404, wrong routes) | ❌ | ⚠️ | ✅ |
| **LLM bugs** (generation failures) | ❌ | ❌ | ✅ |
| **Storage bugs** (data not saved) | ❌ | ✅ | ✅ |
| **UI bugs** (buttons not working) | ❌ | ❌ | ✅ |
| **Contract bugs** (schema mismatches) | ✅ | ✅ | ⚠️ |

## Test Coverage Goals

### Critical Paths (Must Have Tests)
- ✅ Course creation → Navigation → Editor
- ✅ CourseId extraction and storage
- ✅ Route correctness
- ✅ Error handling (401, CORS, network)

### Important Paths (Should Have Tests)
- ✅ MCP method validation
- ✅ Contract validation
- ✅ LLM features (rewrite, variants, co-pilot)
- ✅ Storage and retrieval

### Nice-to-Have (Can Add Later)
- ⏳ Performance benchmarks
- ⏳ Load testing
- ⏳ Accessibility tests

## Adding New Tests

### When You Find a Bug Manually:

1. **Write a failing test first** (TDD)
   ```typescript
   it('should extract courseId from job object', () => {
     const job = { course_id: 'test-123' };
     const courseId = extractCourseId(null, job);
     expect(courseId).toBe('test-123'); // This would fail with the bug
   });
   ```

2. **Fix the bug**

3. **Verify test passes**

4. **Add to appropriate test suite**

### Test Naming Convention:
- Unit tests: `*.test.ts` (Jest)
- Integration tests: `*.spec.ts` (Vitest)
- E2E tests: `*.spec.ts` (Playwright)

## CI Integration

### Recommended CI Pipeline:
```yaml
1. npm run typecheck        # Type safety
2. npm run lint             # Code quality
3. npm test                 # Unit tests (fast)
4. npm run test:integration # Integration tests (medium)
5. npm run e2e:live         # E2E tests (slow, optional)
```

### When to Run E2E Tests:
- ✅ Before major releases
- ✅ On pull requests (can be slow)
- ✅ Nightly (already configured)
- ⚠️ Not on every commit (too slow)

## Test Maintenance

### Keep Tests Updated:
- When adding new features → add tests
- When fixing bugs → add regression tests
- When refactoring → update tests
- When contracts change → update contract tests

### Test Quality:
- ✅ Tests should be **deterministic** (same input = same output)
- ✅ Tests should be **isolated** (don't depend on each other)
- ✅ Tests should be **fast** (unit < 1s, integration < 30s, E2E < 10min)
- ✅ Tests should **fail loudly** (clear error messages)

## Summary

**You now have comprehensive test coverage that catches:**
- ✅ All the bugs you've been finding manually
- ✅ Route bugs (404, wrong paths)
- ✅ CourseId bugs (missing, wrong format)
- ✅ Navigation bugs (broken links)
- ✅ API bugs (401, CORS, errors)
- ✅ LLM bugs (generation failures)
- ✅ Contract bugs (schema mismatches)

**Run `npm test && npm run test:integration && npm run e2e:live` to catch everything!**

