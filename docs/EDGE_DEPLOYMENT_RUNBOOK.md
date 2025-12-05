# 🚀 Supabase Edge Functions Deployment Runbook

> **CRITICAL**: This document contains hard-won lessons from production debugging.
> Follow these rules EXACTLY or you will encounter 503/500 errors.

## 📋 Pre-Deployment Checklist

Before deploying ANY Edge Function, verify:

- [ ] All imports use `npm:` specifier (NOT `esm.sh`, NOT bare imports)
- [ ] CORS imports are `{ stdHeaders, handleOptions }` (NOT `corsHeaders`)
- [ ] Environment variables use safe access pattern (see below)
- [ ] Supabase client created at TOP LEVEL (outside `serve()`)
- [ ] `SUPABASE_ACCESS_TOKEN` is set for CLI commands

---

## 🔴 CRITICAL: Import Rules

### ✅ CORRECT Imports

```typescript
// Supabase client - MUST use npm: specifier
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS helpers - MUST use these exact exports
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

// Deno standard library
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
```

### ❌ WRONG Imports (Will cause 503)

```typescript
// WRONG: esm.sh can be flaky
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// WRONG: Bare import without npm: prefix
import { createClient } from "@supabase/supabase-js";

// WRONG: corsHeaders doesn't exist - causes startup crash
import { corsHeaders } from "../_shared/cors.ts";
```

---

## 🔴 CRITICAL: Supabase Client Pattern

### ✅ CORRECT Pattern (Client at Top Level)

```typescript
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

// Create client ONCE at module load
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request): Promise<Response> => {
  // Use the pre-created client
  const { data, error } = await supabase.from("table").select("*");
});
```

### ❌ WRONG Pattern (Will cause issues)

```typescript
// WRONG: Non-null assertion can crash if env var missing
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

// WRONG: Creating client inside handler (inefficient, can cause issues)
serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
});
```

---

## 🔴 CRITICAL: CORS Response Pattern

### ✅ CORRECT CORS Handling

```typescript
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

serve(async (req: Request): Promise<Response> => {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return handleOptions(req, "function-name");
  }

  // Success response
  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
  );

  // Error response
  return new Response(
    JSON.stringify({ error: "Something went wrong" }),
    { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
  );
});
```

---

## 🛠️ CLI Deployment Commands

### Authentication

```powershell
# Set access token for session (REQUIRED)
$env:SUPABASE_ACCESS_TOKEN = "sbp_your_token_here"

# Or in bash
export SUPABASE_ACCESS_TOKEN="sbp_your_token_here"
```

### Deploy All Functions

```powershell
.\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env
```

### Deploy Single Function

```powershell
supabase functions deploy save-record --project-ref xlslksprdjsxawvcikfk
```

### Set Secrets

```powershell
# Note: SUPABASE_* prefixed vars are auto-injected, cannot be set manually
supabase secrets set AGENT_TOKEN="your-token" --project-ref xlslksprdjsxawvcikfk
supabase secrets set ANTHROPIC_API_KEY="sk-ant-..." --project-ref xlslksprdjsxawvcikfk
supabase secrets set OPENAI_API_KEY="sk-..." --project-ref xlslksprdjsxawvcikfk
```

---

## 🧪 Verification Script

**ALWAYS run after deployment:**

```bash
npx tsx scripts/verify-live-deployment.ts
```

Expected results:
| Function | Expected Status | Notes |
|----------|-----------------|-------|
| `list-jobs` | ✅ 200 | Should return job array |
| `save-record` | ✅ 200 | Should return `{ ok: true, id: "..." }` |
| `get-record` | 404 | Expected - test fetches non-existent record |
| `enqueue-job` | 401 | Expected without valid AGENT_TOKEN |

---

## 🔍 Debugging 503 Errors

503 = Function crashed at startup. Common causes:

1. **Bad Import**: Check all imports use `npm:` specifier
2. **Missing Export**: Verify CORS exports (`stdHeaders`, `handleOptions`)
3. **Env Var Crash**: Remove `!` assertions, use `if (!var) throw`
4. **Syntax Error**: Check for TypeScript errors

### Debug Steps

1. Check function logs (if available):
   ```bash
   supabase functions logs save-record --project-ref xlslksprdjsxawvcikfk
   ```

2. Compare with working function (`list-jobs`):
   - Same import pattern?
   - Same client initialization?
   - Same CORS handling?

3. Bisect: Comment out code sections until 503 goes away

---

## 📁 Reference: Working Function Template (Hybrid Auth)

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const AGENT_TOKEN = Deno.env.get("AGENT_TOKEN");

// Service role for admin actions (use carefully)
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return handleOptions(req, "my-function");

  // --- HYBRID AUTHORIZATION ---
  let isAuthorized = false;
  let userId = null;

  // 1. Agent Token Check
  const token = req.headers.get("x-agent-token");
  if (AGENT_TOKEN && token === AGENT_TOKEN) {
    isAuthorized = true;
    userId = "agent";
  } 
  // 2. User Session Check
  else if (req.headers.get("Authorization")) {
    const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } }
    });
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      isAuthorized = true;
      userId = user.id;
    }
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401, headers: stdHeaders(req, { "Content-Type": "application/json" }) 
    });
  }
  // ----------------------------

  try {
    // Your logic here...
    return new Response(JSON.stringify({ ok: true, userId }), {
      status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" })
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" })
    });
  }
});
```

---

## 🚨 Common Mistakes & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| 503 Service Unavailable | Bad import or startup crash | Check imports use `npm:`, check CORS exports |
| 401 Unauthorized | Missing/wrong AGENT_TOKEN | Set secret or check header |
| 500 Internal Error | Runtime error in handler | Check logs, add try/catch |
| CORS error in browser | Wrong CORS headers | Use `stdHeaders(req, {...})` |
| "Unauthorized" on deploy | Missing SUPABASE_ACCESS_TOKEN | `$env:SUPABASE_ACCESS_TOKEN = "..."` |

---

## 📋 Deployment Checklist

Before every deployment:

1. [ ] Run `npm run typecheck` locally
2. [ ] Verify imports match this runbook
3. [ ] Set `SUPABASE_ACCESS_TOKEN` env var
4. [ ] Deploy with `deploy-functions.ps1`
5. [ ] Run `verify-live-deployment.ts`
6. [ ] Test in browser (click buttons, check Network tab)

After deployment issues:

1. [ ] Check this runbook for common mistakes
2. [ ] Compare failing function with `list-jobs` (known working)
3. [ ] Check Supabase Dashboard → Functions → Logs
4. [ ] Bisect code to find crash point

