# Deployment Status

This document tracks the deployment parity progress with Dawn React.

## Current Status

**Phase 1: Environment Configuration** ✅ COMPLETE
- [x] Created `supabase/.deploy.env.example` template
- [x] Created `supabase/.deploy.env` with template values
- [x] Created deployment documentation
- [x] Created helper scripts (`deployment-checklist.ps1`, `configure-secrets.ps1`)

**Phase 2: Deploy Edge Functions** 🔴 BLOCKED (Auth)
- [x] Pre-deployment verification scripts ready
- [x] Deployment script exists (`scripts/ci/deploy-functions.ps1`)
- [x] Configured `supabase/.deploy.env` with actual credentials
- [x] Set `SUPABASE_ACCESS_TOKEN` environment variable
- [!] **Deployment Failed:** 401 Unauthorized. The provided PAT is invalid/revoked.
- [!] **Action Required:** Generate a new Supabase PAT and retry deployment.

**Phase 3: Configure Secrets** ✅ COMPLETE
- [x] Helper script created (`scripts/configure-secrets.ps1`)
- [x] Set AGENT_TOKEN secret
- [x] Set OPENAI_API_KEY secret
- [x] Set ANTHROPIC_API_KEY secret
- [x] Set MOCKUP_BUCKET, RELEASE_BUCKET, RELEASE_OBJECT secrets

**Phase 4: Live Verification** ⚠️ PENDING DEPLOY
- [x] Verification script exists (`scripts/verify-live-deployment.ts`)
- [ ] Needs successful deployment to pass

**Phase 5: E2E Testing** ✅ PREPARED
- [x] E2E test suite exists (`tests/e2e/`)
- [x] Created `.env.e2e.example` template
- [x] Created `scripts/create-test-users.ps1` helper script
- [x] Created `scripts/create-test-users.sql` SQL script

**Phase 6: Smoke Test Critical Journeys** 🟡 UI UNBLOCKED (Bypass)
- [x] **UI Bypass Implemented:** `DEV_OPEN_UI` mode enables `localhost` and `lovable` previews to work without real auth/backend.
- [x] Hardcoded seeded IDs used for parent/student dashboards in preview.
- [x] **Polyfill Applied:** Frontend automatically injects `studentId`/`parentId` query params in dev mode to support the *stale* backend until deployment succeeds.
- [ ] Real backend connectivity (and POST endpoints like Game Start) requires Phase 2 completion.

## Next Steps for User

1. **Fix Auth Token** (Critical)
   - Generate new Personal Access Token (PAT) at https://supabase.com/dashboard/account/tokens
   - Set it in your environment: `$env:SUPABASE_ACCESS_TOKEN = "sbp_..."`

2. **Retry Deployment**
   ```powershell
   .\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env
   ```

3. **Verify**
   ```powershell
   npx tsx scripts/verify-live-deployment.ts
   ```

## Notes
- **UI is working:** The app should be navigable in Lovable/Preview thanks to the `DEV_OPEN_UI` patch.
- **Backend is stale:** Edge Functions are not updated with the latest `x-user-id` fixes until deployment succeeds.
