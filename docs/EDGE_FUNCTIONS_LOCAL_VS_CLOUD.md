# Supabase Edge Functions: Local vs Cloud Differences

This document outlines the key differences between running Edge Functions locally (`supabase functions serve`) and in cloud (deployed to Supabase).

## 🎯 Quick Summary

| Aspect | Local (`supabase functions serve`) | Cloud (Deployed) |
|--------|-----------------------------------|------------------|
| **Runtime** | Deno CLI (your machine) | Deno Deploy (Supabase infrastructure) |
| **Startup** | Instant (no cold start) | Cold start on first request (~100-500ms) |
| **Timeout** | No timeout (runs until stopped) | **60 seconds** hard limit |
| **Import Resolution** | More lenient | Strict (must use `npm:` specifier) |
| **Environment Variables** | From `.env.local` file | From Supabase secrets |
| **Logs** | Terminal output | Supabase Dashboard + `supabase functions logs` |
| **CORS** | May differ slightly | Production CORS behavior |
| **Network** | Localhost (no latency) | Real network conditions |
| **Storage URLs** | `localhost:54321` | Production URLs |
| **Cost** | Free | Usage-based (free tier available) |

## 🔍 Detailed Differences

### 1. **Timeout Limits**

**Local:**
- ✅ No timeout - functions run until you stop them
- Perfect for long-running AI operations
- Can test operations that take minutes

**Cloud:**
- ❌ **60-second hard limit** (from `docs/adr/003-ai-course-generation.md`)
- Functions that exceed 60s are killed
- This is why the codebase has a local runner mode (`USE_LOCAL_RUNNER=true`)

**Example from codebase:**
```typescript
// docs/QA/llm-regression.md mentions:
// "Triggers the local mockup_polish runner. This bypasses Supabase's 60-second Edge timeout"
```

### 2. **Import Resolution**

**Local:**
- More lenient with imports
- May accept bare imports that fail in cloud
- Can sometimes work with `esm.sh` URLs

**Cloud:**
- **Strict import requirements** (from `EDGE_DEPLOYMENT_RUNBOOK.md`)
- Must use `npm:` specifier: `import { createClient } from "npm:@supabase/supabase-js@2"`
- Bare imports (`@supabase/supabase-js`) cause **503 errors**
- `esm.sh` imports can be flaky

**Why this matters:**
- Code that works locally may fail in cloud
- Always test imports match the runbook before deploying

### 3. **Environment Variables**

**Local:**
```bash
# Loaded from supabase/.env.local
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

**Cloud:**
```bash
# Set via Supabase secrets
supabase secrets set AGENT_TOKEN="your-token" --project-ref <ref>

# SUPABASE_* vars are auto-injected by Supabase
# Cannot be set manually
```

**Key difference:**
- Local: You control all env vars
- Cloud: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-injected
- Custom secrets must be set via CLI or dashboard

### 4. **Startup Behavior**

**Local:**
- Functions start immediately when you run `supabase functions serve`
- No cold start delay
- Instant feedback

**Cloud:**
- **Cold start** on first request after deployment (~100-500ms)
- Subsequent requests are faster (warm instances)
- Functions may be "spun down" after inactivity

**Impact:**
- First request to a deployed function may be slower
- Not noticeable for most use cases, but important for latency-sensitive operations

### 5. **Error Handling & Debugging**

**Local:**
- Errors print directly to terminal
- Full stack traces
- Easy to debug with breakpoints (if using Deno debugger)
- Can inspect variables in real-time

**Cloud:**
- Errors logged to Supabase Dashboard
- View logs: `supabase functions logs <function-name> --project-ref <ref>`
- Stack traces may be truncated
- Harder to debug (need to add logging)

**From codebase:**
```bash
# HOW_TO_RUN.md shows:
supabase functions logs org-config
supabase functions logs --tail  # Stream all logs
```

### 6. **CORS Behavior**

**Local:**
- CORS headers work, but may behave slightly differently
- Localhost origins are typically allowed
- May not catch CORS issues that appear in production

**Cloud:**
- Production CORS behavior
- Origin whitelisting enforced
- Real browser CORS preflight behavior

**From codebase:**
- `docs/SECURITY.md`: "CORS: Universal CORS wrapper on all edge functions. `ALLOWED_ORIGINS` limits origins; dev allows localhost."
- Local may be more permissive than cloud

### 7. **Network & Storage URLs**

**Local:**
```typescript
// Storage URLs point to localhost
const url = "http://localhost:54321/storage/v1/object/public/courses/file.json"
```

**Cloud:**
```typescript
// Storage URLs point to production
const url = "https://your-project.supabase.co/storage/v1/object/public/courses/file.json"
```

**Impact:**
- URLs generated locally won't work in production
- Always use environment variables: `Deno.env.get("SUPABASE_URL")`
- Never hardcode URLs

### 8. **Performance Characteristics**

**Local:**
- No network latency (localhost)
- Full machine resources (CPU, memory)
- Consistent performance

**Cloud:**
- Network latency (varies by region)
- Shared resources (may throttle under load)
- Performance varies by instance size/plan

### 9. **Deployment Process**

**Local:**
```bash
# Just start serving
supabase functions serve <function-name> --env-file .env
```

**Cloud:**
```bash
# Requires authentication
export SUPABASE_ACCESS_TOKEN="sbp_..."
supabase functions deploy <function-name> --project-ref <ref>

# Then verify
npx tsx scripts/verify-live-deployment.ts
```

**From codebase:**
- `EDGE_DEPLOYMENT_RUNBOOK.md` emphasizes: "ALWAYS run `verify-live-deployment.ts` after deploy"
- Deployment can fail even if local works (imports, env vars, CORS)

### 10. **Cost**

**Local:**
- ✅ Free (runs on your machine)
- No usage limits
- No billing concerns

**Cloud:**
- Free tier: 500K invocations/month
- Paid tiers: Usage-based pricing
- Can get expensive with high traffic

## 🚨 Common Pitfalls

### 1. **"Works Locally, Fails in Cloud"**

**Symptoms:**
- Function returns 503 in cloud
- Works fine with `supabase functions serve`

**Causes:**
- Bad imports (not using `npm:` specifier)
- Missing environment variables
- CORS export issues (`corsHeaders` vs `stdHeaders`)

**Solution:**
- Check `EDGE_DEPLOYMENT_RUNBOOK.md` import rules
- Compare with working function (`list-jobs`)
- Verify all env vars are set as secrets

### 2. **Timeout Issues**

**Symptoms:**
- Function works locally (no timeout)
- Fails in cloud after 60 seconds

**Solution:**
- Use `USE_LOCAL_RUNNER=true` for long operations
- Or break work into smaller chunks
- Or use async job queue pattern

### 3. **Environment Variable Differences**

**Symptoms:**
- Function works locally with `.env.local`
- Fails in cloud with "missing env var"

**Solution:**
- Set secrets: `supabase secrets set VAR_NAME="value"`
- Remember: `SUPABASE_*` vars are auto-injected
- Check secrets: `supabase secrets list --project-ref <ref>`

## ✅ Best Practices

### For Local Development

1. **Use local for iteration**
   - Fast feedback loop
   - No deployment overhead
   - Test logic quickly

2. **Test imports match runbook**
   - Use `npm:` specifiers even locally
   - Avoid `esm.sh` imports
   - This prevents surprises in cloud

3. **Use local runner for long operations**
   - Set `USE_LOCAL_RUNNER=true` in MCP
   - Bypasses 60-second timeout
   - Same code path (registry.ts)

### For Cloud Deployment

1. **Always verify after deploy**
   ```bash
   npx tsx scripts/verify-live-deployment.ts
   ```

2. **Check logs if issues occur**
   ```bash
   supabase functions logs <function> --project-ref <ref>
   ```

3. **Compare with working function**
   - If one function works, compare its structure
   - Same import pattern?
   - Same client initialization?
   - Same CORS handling?

4. **Set secrets before deploying**
   - Don't deploy then add secrets
   - Set all required secrets first
   - Verify with `supabase secrets list`

## 📚 References

- `docs/EDGE_DEPLOYMENT_RUNBOOK.md` - Deployment rules and patterns
- `docs/EDGE_FUNCTIONS_ENV.md` - Environment variable guide
- `docs/LOCAL_FIRST_DEVELOPMENT.md` - Local-first workflow
- `HOW_TO_RUN.md` - Local testing commands
- `docs/QA/llm-regression.md` - Mentions 60-second timeout workaround

## 🎯 Recommendation

**For solo development:**
- Develop locally with `supabase functions serve`
- Use `USE_LOCAL_RUNNER=true` for AI strategies (bypasses timeout)
- Deploy to cloud only for final validation
- This gives you speed + cost savings while maintaining production confidence

**For team development:**
- Use cloud for shared testing
- Local for individual iteration
- Deploy early and often to catch issues
