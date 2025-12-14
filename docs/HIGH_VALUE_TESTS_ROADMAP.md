# High-Value Tests Roadmap

## Current Status
- **Overall Coverage**: 92.89% statements, 96.81% branches, 81.81% functions, 93.03% lines
- **Coverage Threshold**: 94% (currently below threshold for statements, lines, and functions)

## Priority 1: Critical Security & State Management ⚠️

### 1.1 Session & Authentication
- ✅ `session.test.ts` - Session slug management (COMPLETED)
- ❌ `useAuth.test.ts` - Login, logout, session refresh, error handling
- ❌ `refreshSession.test.ts` - Session refresh logic, token expiration
- ❌ `organizationId.test.ts` - Organization ID extraction and validation

**Why High-Value**: Authentication failures cause complete system breakdown. These tests prevent:
- Session leaks
- Auth bypass vulnerabilities
- Multi-tenant data mixing

### 1.2 Security-Critical Utilities
- ✅ `sanitizeHtml.test.ts` - XSS prevention (COMPLETED)
- ❌ `sanitize.test.ts` - Text sanitization edge cases (needs expansion)
- ❌ `embed.test.ts` - PostMessage security, origin validation (partial coverage)

**Why High-Value**: Security vulnerabilities can compromise user data and system integrity.

## Priority 2: Core Business Logic 🎯

### 2.1 Game Logic & State
- ✅ `gameLogic.test.ts` - Core game mechanics (COMPLETED)
- ✅ `gameState.test.ts` - State management (COMPLETED)
- ❌ `useGameSession.test.ts` - Session state, answer handling, progress tracking
- ❌ `Play.test.ts` - Game session flow, item selection, scoring

**Why High-Value**: Core user experience. Bugs here directly impact learning outcomes.

### 2.2 Course Management
- ❌ `useCoursePublishing.test.ts` - Publish, archive, delete logic
- ❌ `useCourseVariants.test.ts` - Variant audit, repair, generation
- ❌ `useCourseCoPilot.test.ts` - Co-pilot job initiation and tracking
- ❌ `CourseEditor.validation.test.ts` - Form validation (items, study texts, media)

**Why High-Value**: Course editor is the primary admin tool. Failures prevent content creation.

### 2.3 Job Pipeline
- ✅ `jobParser.test.ts` - Job parsing (COMPLETED)
- ✅ `pipeline-phaseExtractor.test.ts` - Phase extraction (COMPLETED)
- ✅ `pipeline-logFormatter.test.ts` - Log formatting (COMPLETED)
- ❌ `useJobQuota.test.ts` - Job quota tracking, polling, error handling
- ❌ `usePipelineJob.test.ts` - Pipeline job state management

**Why High-Value**: Job system is critical for AI features. Failures prevent course generation.

## Priority 3: Frequently Used Utilities 🔧

### 3.1 Media & Image Handling
- ✅ `mediaSizing.test.ts` - Responsive media sizing (COMPLETED)
- ✅ `imageOptimizer.test.ts` - Image optimization (COMPLETED)
- ✅ `mediaFit.test.ts` - Aspect ratio calculations (EXISTS)
- ❌ `resolvePublicMediaUrl.test.ts` - Media URL resolution (EXISTS but needs expansion)

**Why High-Value**: Media handling affects performance and UX across the app.

### 3.2 Data Transformation
- ✅ `variantResolution.test.ts` - Variant resolution (EXISTS)
- ✅ `patchBuilder.test.ts` - JSON patch building (EXISTS)
- ❌ `courseAdapter.test.ts` - Course data transformation, version migration
- ❌ `htmlUtils.test.ts` - HTML parsing, text extraction

**Why High-Value**: Data transformation bugs cause silent data corruption.

### 3.3 Navigation & Routing
- ✅ `navigation-helpers.test.ts` - Navigation utilities (EXISTS)
- ❌ `levels.test.ts` - Level filtering and navigation (needs expansion)
- ❌ `embed.test.ts` - Embed mode detection, postMessage handling

**Why High-Value**: Navigation bugs break user flows and cause confusion.

## Priority 4: Integration Points 🔌

### 4.1 API Integration
- ❌ `useMCP.test.ts` - MCP hook (partial, needs expansion)
- ❌ `api-common.test.ts` - API error handling, retries, timeouts (excluded due to import.meta.env)
- ❌ `assignments.test.ts` - Assignment API calls (EXISTS but needs expansion)

**Why High-Value**: API failures cause cascading failures across the app.

### 4.2 State Management
- ✅ `gameState.test.ts` - Game state store (COMPLETED)
- ❌ `offlineQueue.test.ts` - Offline queue management (EXISTS but needs expansion)
- ❌ Cache invalidation tests - Catalog cache, job cache

**Why High-Value**: State management bugs cause data inconsistency and UX issues.

## Priority 5: Error Handling & Edge Cases 🛡️

### 5.1 Error Boundaries
- ✅ `PlayErrorBoundary.test.ts` - Error boundary (COMPLETED)
- ❌ Error handling tests for:
  - Network failures
  - Invalid data formats
  - Missing required fields
  - Concurrent operations

**Why High-Value**: Error handling prevents crashes and improves UX.

### 5.2 Edge Cases
- ❌ Empty state handling (no courses, no jobs, no students)
- ❌ Large data handling (1000+ courses, 100+ jobs)
- ❌ Concurrent operations (multiple users editing same course)
- ❌ Timeout handling (long-running operations)

**Why High-Value**: Edge cases cause production failures.

## Implementation Priority

### Phase 1: Security & Auth (Week 1)
1. `useAuth.test.ts` - Complete auth flow testing
2. `refreshSession.test.ts` - Session management
3. Expand `sanitize.test.ts` - Additional XSS vectors
4. Expand `embed.test.ts` - PostMessage security

### Phase 2: Core Business Logic (Week 2)
1. `useGameSession.test.ts` - Game session management
2. `useCoursePublishing.test.ts` - Course publishing flow
3. `useJobQuota.test.ts` - Job quota management
4. `useCourseVariants.test.ts` - Variant management

### Phase 3: Utilities & Integration (Week 3)
1. Expand `useMCP.test.ts` - Complete MCP hook coverage
2. Expand `resolvePublicMediaUrl.test.ts` - Media URL handling
3. `courseAdapter.test.ts` - Data transformation
4. `htmlUtils.test.ts` - HTML utilities

### Phase 4: Edge Cases & Error Handling (Week 4)
1. Error handling tests for all API calls
2. Empty state tests
3. Large data handling tests
4. Concurrent operation tests

## Coverage Goals

### Current Gaps
- **Functions**: 81.81% (target: 94%) - **12.19% gap**
- **Statements**: 92.89% (target: 94%) - **1.11% gap**
- **Lines**: 93.03% (target: 94%) - **0.97% gap**

### Files Needing Coverage
1. `src/hooks/useAuth.ts` - 0% coverage
2. `src/hooks/useJobQuota.ts` - 0% coverage
3. `src/hooks/useGameSession.ts` - 0% coverage (if exists)
4. `src/lib/courseAdapter.ts` - Low coverage
5. `src/lib/htmlUtils.ts` - Low coverage
6. `src/lib/offlineQueue.ts` - Partial coverage

## Success Metrics

- ✅ All Priority 1 tests implemented
- ✅ Function coverage > 94%
- ✅ Statement coverage > 94%
- ✅ Line coverage > 94%
- ✅ All security-critical code tested
- ✅ All error paths tested

## Notes

- Tests using `import.meta.env` may need special handling or exclusion
- Integration tests may require mocked Supabase client
- E2E tests should be separate from unit tests
- Focus on testing behavior, not implementation details


