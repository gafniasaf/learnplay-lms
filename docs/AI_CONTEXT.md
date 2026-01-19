# 🧠 SYSTEM CONTEXT (PRIORITY ZERO)

**CRITICAL:** Before writing ANY code, YOU MUST READ:

1. `docs/AI_CONTEXT.md` (this file) - Architectural invariants
2. `docs/AGENT_BUILD_PROTOCOL.md` - **MANDATORY** build sequence
3. `PLAN.md` - Complete system specification

## 🆕 Recent Modifications (2025-12-30)

These changes were added during the Teacherbuddy → LearnPlay port phases. New agents MUST account for them.

### Library Courses (Imported / Non‑playable Content)

- **Edge Functions**
  - `list-courses` now supports optional `format` query param. It filters on `course_metadata.tags.__format`.
  - `search-courses` now supports optional `format` query param (same filter).
- **Frontend**
  - `useMCP.getCourseCatalog()` now requests `format=practice` so imported library formats (e.g. `mes`) do **not** enter learner/admin playable catalogs and break Play flows.
  - New admin UI routes for browsing imported/reference content:
    - `/admin/library-courses` (server-side pagination/search + format filter)
    - `/admin/library-courses/:courseId` (raw `course.json` envelope viewer)
- **MCP**
  - New MCP methods: `lms.listLibraryCourses`, `lms.searchLibraryCourses`, `lms.getLibraryCourseContent`.

### Lesson Kit Pipeline (3‑Pass Port)

- **Shared module added**: `supabase/functions/_shared/lesson-kit/*`
  - Pass 1: extract ground truth (no LLM)
  - Pass 2: constrained LLM transform via `supabase/functions/_shared/ai.ts`
  - Pass 3: validate + (optional) repair
- **Policy**: There is **NO silent fallback** on LLM failures. Missing provider MUST fail with a clear `BLOCKED` error. `skipLLM=true` is an explicit debug mode only.
- **Next wiring step**: Implement a manual `ai-job-runner` strategy at `supabase/functions/ai-job-runner/strategies/lessonkit_build.ts` (manual strategies override generated `gen-*` stubs).

See `docs/TEACHERBUDDY_PORT_STATUS.md` for a single high-signal mapping of ported components + next steps.

## 📚 KD 2026 (VIG/VP) Curriculum Context

KD 2026 data is available for internal KD-mapping and gap analysis:

- Canonical KD JSON: `data/kd-2026-vigvp.json`
- Flat KD codes list: `data/kd-2026-codes.txt`
- Raw extracted KD text: `tmp/kd-2026-extracted.txt`
- Usage guide: `docs/KD_2026.md`

## 🚨 BUILD PROTOCOL (READ FIRST)

**When asked to "Build," "Implement," "Create pages," or "Make it work":**

1. **READ** `docs/AGENT_BUILD_PROTOCOL.md` - Contains the exact build sequence
2. **DO NOT** manually write page components from scratch
3. **DO NOT** regenerate existing implementations (`gameState.ts`, `gameLogic.ts`, `useMCP.ts`)
4. **DO** run the Factory scripts: `scaffold-manifest.ts` → `compile-learnplay.cjs`
5. **DO** enhance compiled scaffolds by importing existing stores
6. **DO** run `npm run verify` after every phase

**Anti-Pattern:** Writing custom page implementations that bypass the compiled scaffolds.

---

## 🕵️ DIAGNOSTIC PROTOCOL (PRIORITY ONE)

**When asked to "Debug," "Fix," "Troubleshoot," or "Why is X failing?":**

1.  **HALT.** Do NOT read source code immediately.
2.  **DIAGNOSE RUNTIME STATE.** Call the appropriate `lms` tool to gather evidence:
    *   **System/Connection Issues:** `lms.health()`
    *   **Job/Task Failures:** `lms.listJobs({ status: 'failed' })` + `lms.logs({ jobId: '...' })`
    *   **Content/Data Issues:** `lms.getCourse({ id: '...' })`
    *   **Shortcut:** Run `npm run diag:lms` to capture the health + latest job summaries before touching files.
3.  **ANALYZE.** Form a hypothesis based on the *logs* and *state*.
    *   *Example:* "Job failed with 404" -> Check Edge Function deployment, not just job logic.
4.  **TARGET.** Only *after* diagnosing, read the specific file implicated by the evidence.

**Anti-Pattern:** Reading `index.ts` or `strategies/` files before confirming the system is healthy.

## 🏗️ ARCHITECTURE: LIVE vs. FACTORY PIPELINES

We distinguish between two types of work. Use the correct pipeline:

### 1. LIVE Pipeline (Synchronous)
*   **Use for:** Chat, Search, Immediate Feedback, Auth checks.
*   **Contract:** `Frontend` → `Edge Function (Direct)` → `Client`.
*   **Manifest Config:** `"execution_mode": "synchronous"`.
*   **Why:** Latency is critical (<2s). If it fails, the user retries immediately.
*   **Anti-Pattern:** Putting chat messages into a Postgres queue.

### 2. FACTORY Pipeline (Asynchronous)
*   **Use for:** Compiling code, Batch generation, Long-running analysis (>10s).
*   **Contract:** `Frontend` → `enqueue-job` → `Postgres` → `Worker` → `Edge Function`.
*   **Manifest Config:** `"execution_mode": "async"` (default).
*   **Why:** Durability is critical. Jobs must be retriable and observable.

## 🚫 ANTI-PATTERN: PREMATURE COMPLEXITY
**Do not build async queues, complex abstractions, or proxy layers until the simple version breaks.**
- **Interactive UI:** CONNECT DIRECTLY.
- **Validation:** Verify the *simplest* path works first. If you can't `curl` it, you can't debug it.

## 🔄 The Autonomous Refactor Loop

**When asked to "Refactor to [Domain]":**

1.  **Update Manifest:** Modify `system-manifest.json` to match the new domain.
2.  **Scaffold:** Run `npx ignite scaffold` to regenerate contracts.
3.  **The Repair Loop:**

    * Run `npx ignite verify`.
    * If **FAIL**: Read the error log. Fix the specific components causing the error (rename files, map props).
    * **MAX ATTEMPTS:** 3. If the same error persists after 3 attempts, **HALT** and ask for human review.
    * If **PASS**: Stop. The refactor is complete.

## 🛑 LOOP TERMINATION POLICY

**All repair/retry loops MUST have explicit exit conditions.**

```typescript
// ❌ FORBIDDEN - Infinite retry
while (error) {
  fix();
  retry();
}

// ✅ REQUIRED - Bounded retry with escalation
const MAX_ATTEMPTS = 3;
let attempts = 0;
while (error && attempts < MAX_ATTEMPTS) {
  fix();
  retry();
  attempts++;
}
if (error) {
  console.error("❌ HALTING: Same error after 3 attempts. Human intervention required.");
  process.exit(1);
}
```

## 🚫 CONFIGURATION ANTI-PATTERNS (NEVER DO THIS)

**NEVER hardcode environment-specific values to "make it work".**

```typescript
// ❌ FORBIDDEN - Hardcoded bypass
const forceEdge = true; // "temporary fix"
const API_URL = "https://prod.example.com"; // hardcoded

// ✅ REQUIRED - Use environment variables
const useEdge = import.meta.env.VITE_USE_EDGE === 'true';
const API_URL = import.meta.env.VITE_API_URL;
```

If something doesn't work locally:
1. Document the required env var
2. Tell the user to configure it
3. DON'T hardcode a bypass

## 🔐 Hybrid Authorization

Edge Functions must support both Agent and User authentication:
1. **Agent Token:** `x-agent-token` header (for background workers).
2. **User Session:** `Authorization: Bearer <JWT>` (for frontend calls).

Use `supabase.auth.getUser()` to verify user sessions. Do NOT rely solely on the Service Role key for public functions.

## 🛑 No Silent Mocks Policy

If a backend service (OpenAI, Database, etc.) is unavailable or missing credentials:
1. **FAIL LOUDLY.** Throw a clear error (e.g., "BLOCKED: OPENAI_API_KEY missing").
2. **DO NOT MOCK SUCCESS.** Never return fake data that looks like a success.
3. **UI MUST REFLECT FAILURE.** The user must see the error message.

## 🚫 ABSOLUTE NO-FALLBACK POLICY (CRITICAL)

**NEVER write code that silently degrades or uses fallback values.**

### Forbidden Patterns:
```typescript
// ❌ FORBIDDEN - Default fallback tokens
const TOKEN = process.env.TOKEN || 'dev-local-secret';
const TOKEN = process.env.TOKEN || 'placeholder-token';
const TOKEN = process.env.TOKEN ?? 'test-token';

// ❌ FORBIDDEN - ALLOW_ANON bypass
if (process.env.ALLOW_ANON === 'true') { /* skip auth */ }

// ❌ FORBIDDEN - Default organization fallback  
const orgId = user.organization_id ?? 'default';

// ❌ FORBIDDEN - Silent mock data
if (!realData) return mockData;
```

### Required Patterns:
```typescript
// ✅ REQUIRED - Fail if not configured
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("❌ TOKEN is REQUIRED");
  process.exit(1);
}

// ✅ REQUIRED - Explicit error for missing config
if (!user.organization_id) {
  throw new Error("User account not configured: missing organization_id");
}

// ✅ REQUIRED - Clear auth failure
throw new Error("Unauthorized: Valid Agent Token or User Session required");
```

### Why This Matters:
1. **Debugging Hell:** Fallbacks hide the real problem, causing hours of debugging
2. **Security Risk:** Default tokens/orgs can leak into production
3. **False Confidence:** Tests pass but system doesn't actually work
4. **Data Corruption:** Wrong org IDs can mix tenant data

### The Only Exception:
Feature flags that are EXPLICITLY documented and VISIBLE in logs:
```typescript
// ✅ OK - Explicit, logged, documented feature flag (example)
// NOTE: IgniteZero forbids mock mode. Do NOT add mock responses behind VITE_USE_MOCK.
const DEV_FEATURES = import.meta.env.VITE_ENABLE_DEV === 'true';
if (DEV_FEATURES) {
  console.warn("[DEV] Dev features enabled");
}
```

## 🛡️ Test Integrity & Contract Testing (CRITICAL)

**NEVER weaken a test to make it pass.**
- If a test fails, fix the code.
- If the test is wrong, update the test logic, but do not remove assertions or skip checks without explicit approval.
- Run `npm run test` locally to verify before pushing.

### 🚫 FORBIDDEN: Mock Theater Tests

**Do NOT write tests that mock the thing they're supposed to test.**

```typescript
// ❌ FORBIDDEN - "Mock Theater" (tests nothing)
jest.mock('@/hooks/useDashboard', () => ({
  useDashboard: jest.fn(),
}));

mockUseDashboard.mockReturnValue({
  dashboard: { /* fake data */ },
  loading: false,
});

it('renders', () => {
  render(<Dashboard />);
  expect(screen.getByText('fake data')).toBeInTheDocument();
  // ↑ This only tests that React can render a string!
});
```

### ✅ REQUIRED: Contract Tests for Hooks

**Every hook that calls an Edge Function MUST have a contract test.**

```typescript
// ✅ REQUIRED - Contract test (catches bugs like { role } vs { studentId })
it('passes studentId (NOT role) for student dashboard', async () => {
  renderHook(() => useDashboard('student'));
  
  await waitFor(() => expect(mcpCalls.length).toBeGreaterThan(0));
  
  const call = mcpCalls.find(c => c.method.includes('student-dashboard'));
  expect(call?.params).toHaveProperty('studentId');  // ← Catches the bug!
  expect(call?.params).not.toHaveProperty('role');   // ← Explicit negative
});
```

### Test File Locations

| Test Type | Location | What It Tests |
|-----------|----------|---------------|
| **Contract tests** | `tests/unit/hooks/contracts/*.contract.test.ts` | Correct params passed to APIs |
| **Pure logic** | `tests/unit/*.test.ts`, `src/lib/tests/*.test.ts` | Functions with inputs/outputs |
| **E2E** | `tests/e2e/*.spec.ts` | Full user flows |
| **Live API** | `tests/e2e/live-*.spec.ts` | Real Supabase/LLM calls |

### When Adding a New Hook

1. If hook calls Edge Function → **ADD CONTRACT TEST** in `tests/unit/hooks/contracts/`
2. If hook manages UI state only → Unit test is optional
3. **NEVER** mock the hook in page tests - use E2E instead

### Running Contract Tests

```bash
npm run test:contracts  # Run all contract tests
npm run test -- --testPathPattern="useDashboard.contract"  # Run specific
```

### Why This Matters

The `{ role }` instead of `{ studentId }` bug slipped through because:
1. Page tests mocked `useDashboard` completely
2. No test verified what params `useDashboard` passed to the API
3. Jest mocks hid the actual bug

Contract tests would have caught this immediately.

## 🚀 Edge Function Deployment (MANDATORY READING)

**Before deploying ANY Supabase Edge Function, READ `docs/EDGE_DEPLOYMENT_RUNBOOK.md`.**

### Quick Rules (Memorize):
1. **Imports**: Use `npm:@supabase/supabase-js@2` (NOT `esm.sh`)
2. **CORS**: Import `{ stdHeaders, handleOptions }` (NOT `corsHeaders`)
3. **Auth**: Use Hybrid Auth (Agent Token + User Session) for shared functions.
4. **Client**: Create at TOP LEVEL (outside `serve()`)
5. **Verify**: ALWAYS run `npx tsx scripts/verify-live-deployment.ts` after deploy

### 503 = Startup Crash
Check: bad imports, non-existent exports, env var assertions.

### Deployment
```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."; .\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env
npx tsx scripts/verify-live-deployment.ts  # ALWAYS verify after deploy
```

## 🔐 CREDENTIAL HYGIENE (STRICT)

**If `supabase functions deploy` fails with `401 Unauthorized` or ANY credential is missing:**

1.  **HALT.** Do NOT search for credentials in logs, history, or files.
2.  **REPORT.** Tell the user exactly which credential is missing.
3.  **WAIT.** Do not proceed until user provides the credential via secure method.

**Anti-Pattern:** `findstr "sbp_"` or any grep for secrets. This is a security violation.
**Anti-Pattern:** Committing `.env` files or secrets to markdown/code.

## 📦 Lovable MVP Handoff

**When receiving a Lovable MVP export for reconstruction:**

### Automated (Preferred)
```bash
npx tsx scripts/ingest-lovable.ts <path-to-lovable-export>
npm run verify
```

### Manual Steps (if script fails)
1. **READ** `HANDOFF_SPEC.md` from the handoff package first
2. **READ** this file (`docs/AI_CONTEXT.md`) for architecture rules
3. **UPDATE** `system-manifest.json` with entities from HANDOFF_SPEC
4. **RUN** `npx tsx scripts/scaffold-manifest.ts` to generate contracts
5. **COPY** Lovable's React components to `src/`
6. **FIX** TypeScript errors to match Ignite Zero contracts
7. **EXPORT** mock HTMLs: `npx tsx scripts/export-mocks.ts`
8. **UPDATE** `coverage.json` with CTAs from HANDOFF_SPEC
9. **RUN** `npm run verify` until all checks pass
10. **WIRE** MCP hooks where needed (replace direct Supabase calls)

**DO NOT ask the user questions unless blocked.** See `docs/AGENT_LOVABLE_INGESTION.md` for detailed agent instructions.

See `docs/LOVABLE_TO_IGNITEZERO_GUIDE.md` for the complete workflow.
See `docs/templates/` for handoff templates.

## ✅ Golden Plan Verification Checklist

Run this sequence before calling a build "done." The exact prompts/scripts live in `docs/QA/llm-regression.md`; link or copy them into any Golden Plan you author so future agents have clear marching orders.

1. `npm run diag:lms` – capture MCP/job health before touching code.
2. `npm run typecheck`
3. `npm run test`
4. `npm run mock:validate`
5. `npm run verify:cta` – 100% CTA coverage check
6. `npm run test:chat`
7. `npm run test:chat:quality`
8. `npm run verify:live`

If any command fails, fix the code. Never skip or comment out tests to "make it pass."

## 🎯 100% CTA Tracking (AI-Managed Systems)

**This system is 100% AI-managed. Every interactive element must be tracked.**

### The Rule
Every `<Button>`, `<button>`, `<Link>`, `<a>`, or `role="button"` MUST have a `data-cta-id` attribute.

```typescript
// ❌ FORBIDDEN
<Button onClick={save}>Save</Button>

// ✅ REQUIRED
<Button data-cta-id="cta-editor-save" data-action="action" onClick={save}>Save</Button>
```

### Verification Commands
```bash
npm run verify:cta              # Report mode (shows untracked)
npm run verify:cta:strict       # Strict mode (fails if not 100%)
```

### Why 100%?
- AI agents need guardrails to prevent silent UI breakage
- Complete audit trail for every interactive element
- Automated regression detection catches AI mistakes
- No "invisible" buttons that slip through testing

See `.cursorrules` section "100% CTA TRACKING MANDATE" for full details.

---

## 📋 Deployment Configuration

**Project Reference:** `eidcegehaswbtzrwzvfa`  
**Supabase URL:** `https://eidcegehaswbtzrwzvfa.supabase.co`  
**Organization ID:** `4d7b0a5c-3cf1-49e5-9ad7-bf6c1f8a2f58`

**Deployment Status:** ✅ Complete
- 70+ Edge Functions deployed and verified
- 30/30 tested functions working (100% success rate)
- All secrets configured (AGENT_TOKEN, OPENAI_API_KEY, ANTHROPIC_API_KEY, MOCKUP_BUCKET, RELEASE_BUCKET, RELEASE_OBJECT)
- Storage buckets created (mockups, releases)

**Known Configuration:**
- Test users need to be created manually in Supabase Dashboard > Authentication
- Release file needs to be uploaded to `releases` bucket for `download-release` function
- See `docs/DEPLOYMENT_LOG.md` for complete deployment record

**E2E Testing:**
- Use `scripts/create-test-users.ps1` to create test users
- Configure `.env.e2e` with test credentials
- Run `scripts/run-e2e-tests.ps1` to execute E2E tests

**Smoke Testing:**
- See `docs/SMOKE_TEST_CHECKLIST.md` for manual verification steps

---

## 🧪 Lovable Deployment Smoke Tests

**Purpose:** Catch runtime issues that only appear in deployed environments (Lovable, Vercel, etc.)

### What This Tests

| Test | What It Catches |
|------|-----------------|
| Dynamic import failures | `React.lazy()` module loading over network/CDN |
| Edge Function connectivity | Real API calls (not mocks) timing out |
| CORS from external origins | Lovable domain ↔ Supabase Edge Functions |
| Auth page functionality | Login form renders correctly |
| Error boundaries | Graceful error handling |

### Running the Tests

```bash
# Run against default Lovable preview
npm run test:lovable

# Run with headed browser (for debugging)
npm run test:lovable:headed

# View HTML report
npm run test:lovable:report

# Run against custom URL
LOVABLE_URL=https://your-preview.lovable.app npm run test:lovable
```

### Why Standard Tests Miss These Issues

1. **Unit tests** mock `useMCP` - never hit real network
2. **E2E tests** must run with `VITE_USE_MOCK=false` - hit real Edge Functions/DB (no fake data)
3. **E2E tests** run against `localhost` - no CORS testing
4. **Jest** uses its own module system - not Vite's dynamic imports

### When to Run

- After deploying to Lovable
- When debugging "works locally, fails on Lovable" issues
- Before releasing to production
- In CI as a post-deployment verification step

---

## 🧪 Hook Contract Testing

**Purpose:** Catch parameter mismatches between hooks and Edge Functions (e.g., passing `role` instead of `studentId`).

### The Problem This Solves

```typescript
// ❌ BUG: Passes wrong param
const data = await mcp.callGet('lms.student-dashboard', { role: 'student' });

// ✅ CORRECT: Passes required param
const data = await mcp.callGet('lms.student-dashboard', { studentId: user.id });
```

Component tests mock `useDashboard` entirely, so they never catch this. We need **layered testing**:

| Layer | Test | What to Mock | What It Catches |
|-------|------|--------------|-----------------|
| **Component** | `Dashboard.test.tsx` | Mock `useDashboard` | UI rendering |
| **Hook Contract** | `allHookContracts.test.ts` | Mock `useMCP` methods | Wrong params |
| **Integration** | E2E tests | Nothing | Full system |

### Running Contract Tests

```bash
# Run all hook contract tests
npm run test:contracts

# Run with verbose output
npm run test:contracts -- --verbose

# Run specific hook tests
npm run test -- --testPathPattern="useDashboard"
```

### Adding New Hook Contract Tests

When creating a new hook that calls MCP/Edge Functions:

1. Add test to `tests/unit/hooks/contracts/allHookContracts.test.ts`
2. Use the tracking utilities from `hookContractTestUtils.ts`
3. Verify required parameters are passed
4. Verify forbidden parameters (like `role` for student endpoints) are NOT passed

```typescript
describe('useMyNewHook', () => {
  it('passes required params correctly', async () => {
    const { useMyNewHook } = await import('@/hooks/useMyNewHook');
    
    renderHook(() => useMyNewHook({ myParam: 'value' }), {
      wrapper: createTestWrapper(),
    });
    
    await waitFor(() => {
      const calls = getCallsTo('myEdgeFunction');
      expect(calls.length).toBeGreaterThan(0);
    });
    
    expectMethodCalledWith('myEdgeFunction', { myParam: 'value' });
  });
});
```

### Files

- `tests/unit/hooks/contracts/hookContractTestUtils.ts` - Test utilities
- `tests/unit/hooks/contracts/allHookContracts.test.ts` - All hook tests

