# 🧠 SYSTEM CONTEXT (PRIORITY ZERO)

**CRITICAL:** Before writing ANY code, YOU MUST READ:
1. `docs/AI_CONTEXT.md` (this file) - Architectural invariants
2. `docs/AGENT_BUILD_PROTOCOL.md` - **MANDATORY** build sequence
3. `PLAN.md` - Complete system specification

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
2.  **Scaffold:** Run `npx tsx scripts/scaffold-manifest.ts` to regenerate contracts.
3.  **The Repair Loop:**

    * Run `npm run verify`.
    * If **FAIL**: Read the error log. Fix the specific components causing the error (rename files, map props). **Repeat.**
    * If **PASS**: Stop. The refactor is complete. Ask for human review.

## 🧪 Architect Edge Contracts

- When editing `supabase/functions/architect-advisor` or introducing a new architect mode, update `tests/integration/architect-contract.spec.ts` **before** wiring UI changes.
- `scripts/verify.ts` runs this suite automatically; do not skip it. If you add/remove modes, extend both the contract test and the verify script so every mode has coverage.

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

## 🛡️ Test Integrity

**NEVER weaken a test to make it pass.**
- If a test fails, fix the code.
- If the test is wrong, update the test logic, but do not remove assertions or skip checks without explicit approval.
- Run `npm run test` locally to verify before pushing.

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

## 🆘 DEPLOYMENT EMERGENCY PROTOCOL

**If `supabase functions deploy` fails with `401 Unauthorized`:**

1.  **DO NOT GIVE UP.** The token might be in the terminal history.
2.  **SEARCH HISTORY:** Run this command to find valid `sbp_` tokens used by previous agents:
    ```powershell
    findstr /s "sbp_" ".cursor/projects/*/terminals/*"
    ```
3.  **RECOVER & RETRY:** If you find a token (e.g., `sbp_...`), set it and try again:
    ```powershell
    $env:SUPABASE_ACCESS_TOKEN = "sbp_FOUND_TOKEN"
    npx supabase functions deploy ...
    ```

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
5. `npm run test:chat`
6. `npm run test:chat:quality`
7. `npm run verify:live`

If any command fails, fix the code. Never skip or comment out tests to “make it pass.”
