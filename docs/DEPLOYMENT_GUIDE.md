# Deployment Guide

This guide walks you through deploying IgniteZero to achieve full parity with Dawn React.

## Prerequisites

- Supabase project created
- Supabase CLI installed (`npm install -g supabase`)
- Access to Supabase Dashboard
- AI provider API keys (OpenAI and/or Anthropic)

---

## Phase 1: Environment Configuration

### Step 1.1: Configure Deployment Environment

Edit `supabase/.deploy.env` with your Supabase credentials:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
AGENT_TOKEN=your-secure-random-token-here
ORGANIZATION_ID=your-org-uuid-here
```

**Where to get these:**
1. Go to Supabase Dashboard > Project Settings > API
2. Copy the URL, anon key, and service role key
3. Generate AGENT_TOKEN: `openssl rand -hex 32`
4. Get ORGANIZATION_ID from Database > organizations table

### Step 1.2: Configure Frontend Environment

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_USE_MOCK=false
AGENT_TOKEN=your-agent-token-here
ORGANIZATION_ID=your-org-uuid-here
```

### Step 1.3: Get Supabase Access Token

1. Go to Supabase Dashboard > Account > Access Tokens
2. Generate a new token with "Full access" scope
3. Save it securely (you'll set this before deployment)

---

## Phase 2: Deploy Edge Functions

### Step 2.1: Pre-Deployment Verification

```powershell
# Verify TypeScript compiles
npm run typecheck

# Run scaffold to ensure contracts are up to date
npx tsx scripts/scaffold-manifest.ts

# Run verification (local)
npm run verify
```

### Step 2.2: Deploy All Functions

```powershell
# Set access token (PowerShell)
$env:SUPABASE_ACCESS_TOKEN = "sbp_YOUR_TOKEN_HERE"

# Deploy all functions
.\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env
```

**Expected output:** Each function deploys with success message.

**If any function fails (503):** Check [docs/EDGE_DEPLOYMENT_RUNBOOK.md](docs/EDGE_DEPLOYMENT_RUNBOOK.md) for debugging steps.

### Step 2.3: Verify Deployment Status

1. Go to Supabase Dashboard > Edge Functions
2. Verify all functions show "Active" status
3. Check for any with "Error" status - these need fixing

---

## Phase 3: Configure Secrets

### Step 3.1: Set Required Secrets

```powershell
# Set access token first
$env:SUPABASE_ACCESS_TOKEN = "sbp_YOUR_TOKEN_HERE"

# Project ref (extract from SUPABASE_URL)
$PROJECT_REF = "YOUR_PROJECT_REF"

# AGENT_TOKEN - Used for MCP/agent authentication
supabase secrets set AGENT_TOKEN="your-generated-token" --project-ref $PROJECT_REF

# AI Provider Keys (required for AI features)
supabase secrets set OPENAI_API_KEY="sk-..." --project-ref $PROJECT_REF
supabase secrets set ANTHROPIC_API_KEY="sk-ant-..." --project-ref $PROJECT_REF

# Optional: Sentry for error tracking
supabase secrets set SENTRY_DSN="https://...@sentry.io/..." --project-ref $PROJECT_REF
```

### Step 3.2: Verify Secrets Are Set

```powershell
supabase secrets list --project-ref $PROJECT_REF
```

Should show all secrets (values hidden).

---

## Phase 4: Live Verification

### Step 4.1: Run Live Deployment Verification

```powershell
# Set required environment variables
$env:SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_ANON_KEY = "eyJ..."
$env:AGENT_TOKEN = "your-agent-token"
$env:ORGANIZATION_ID = "your-org-uuid"

# Run verification
npx tsx scripts/verify-live-deployment.ts
```

**Expected output:**
- All core functions should pass (green checkmarks)
- Some may skip (expected for tests needing specific data)
- Any 404 = function not deployed
- Any 401 = AGENT_TOKEN mismatch
- Any 503 = function crashed at startup

### Step 4.2: Fix Any Failures

For each failed function:

1. Check Supabase Dashboard > Edge Functions > [function-name] > Logs
2. Compare with [docs/EDGE_DEPLOYMENT_RUNBOOK.md](docs/EDGE_DEPLOYMENT_RUNBOOK.md)
3. Fix and redeploy:
   ```powershell
   supabase functions deploy FUNCTION_NAME --project-ref $PROJECT_REF --no-verify-jwt
   ```

---

## Phase 5: E2E Testing

### Step 5.1: Create Test Users

Create test users in Supabase Dashboard > Authentication:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@test.local | TestAdmin123! |
| Teacher | teacher@test.local | TestTeacher123! |
| Student | student@test.local | TestStudent123! |
| Parent | parent@test.local | TestParent123! |

### Step 5.2: Configure E2E Environment

Create `.env.e2e` file (not committed to git):

```env
E2E_ADMIN_EMAIL=admin@test.local
E2E_ADMIN_PASSWORD=TestAdmin123!
E2E_TEACHER_EMAIL=teacher@test.local
E2E_TEACHER_PASSWORD=TestTeacher123!
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Step 5.3: Run E2E Tests

```powershell
# Load env and run tests
npx cross-env $(Get-Content .env.e2e | ForEach-Object { $_ }) npx playwright test --grep "live-"
```

---

## Phase 6: Smoke Test Critical Journeys

Manually verify these flows in the browser:

| Journey | Steps | Expected Result |
|---------|-------|-----------------|
| **Login** | Go to /auth, enter credentials | Redirects to dashboard |
| **Course Catalog** | Go to /courses | Shows course list from database |
| **Play Game** | Select course, click Play | Game loads, items display |
| **Submit Answer** | Answer question | Score updates, logged to DB |
| **Generate Course** | Go to /admin/courses, click Generate | Job enqueued, progress updates |
| **Publish Course** | Edit course, click Publish | Version increments, success toast |

---

## Troubleshooting

### Function Returns 503

1. Check function logs in Supabase Dashboard
2. Verify imports use `npm:` specifier (see [EDGE_DEPLOYMENT_RUNBOOK.md](docs/EDGE_DEPLOYMENT_RUNBOOK.md))
3. Check CORS imports use `{ stdHeaders, handleOptions }`
4. Verify Supabase client created at top level

### Function Returns 401

- Check AGENT_TOKEN matches between secret and request header
- Verify `x-agent-token` header is sent correctly

### Function Returns 404

- Function not deployed - run deploy script again
- Check function name matches exactly

---

## Quick Reference

- **Deploy script:** `.\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env`
- **Verify script:** `npx tsx scripts/verify-live-deployment.ts`
- **Deployment runbook:** [docs/EDGE_DEPLOYMENT_RUNBOOK.md](docs/EDGE_DEPLOYMENT_RUNBOOK.md)
