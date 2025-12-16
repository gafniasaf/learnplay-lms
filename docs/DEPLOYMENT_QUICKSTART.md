# Deployment Quick Start

Quick reference for deploying IgniteZero to Supabase.

## Prerequisites Checklist

- [ ] Supabase project created
- [ ] Supabase CLI available (**preferred:** repo-pinned `npx supabase`; optional: global install)
- [ ] Access to Supabase Dashboard
- [ ] AI provider API keys (OpenAI and/or Anthropic)

## PowerShell Notes (Windows)

- **PowerShell 5.1**: `&&` is **not** a valid separator. Run commands on separate lines (or use `;`).
- **Do not paste secrets** (PATs, API keys) into chat or commit history. Export via env vars or store only in gitignored env files (`supabase/.deploy.env`, `learnplay.env`).
- **Use the repo-pinned CLI** when possible:

```powershell
npx supabase --version
```

## 5-Minute Deployment

### Step 1: Configure Environment (2 min)

```powershell
# 1. Edit supabase/.deploy.env with your credentials
#    Get values from: Supabase Dashboard > Project Settings > API

# 2. Set access token
$env:SUPABASE_ACCESS_TOKEN = "sbp_YOUR_TOKEN_HERE"
#    Get from: Supabase Dashboard > Account > Access Tokens

# If you see "401 Unauthorized" despite a valid token, run:
# docs/DEPLOYMENT_MAGIC.md (logout/login refreshes Supabase CLI cached auth)
```

### Step 2: Deploy Functions (2 min)

```powershell
# Run pre-flight check
.\scripts\deployment-checklist.ps1

# Deploy all functions
.\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env

# If you need to deploy a single function (recommended for quick iteration):
# npx supabase functions deploy generate-course --project-ref YOUR_PROJECT_REF --no-verify-jwt --debug
```

### Step 3: Configure Secrets (1 min)

```powershell
# Option A: Use helper script
.\scripts\configure-secrets.ps1 `
  -ProjectRef "YOUR_PROJECT_REF" `
  -AgentToken "your-generated-token" `
  -OpenAIKey "sk-..." `
  -AnthropicKey "sk-ant-..."

# Option B: Manual commands
$PROJECT_REF = "YOUR_PROJECT_REF"
supabase secrets set AGENT_TOKEN="token" --project-ref $PROJECT_REF
supabase secrets set OPENAI_API_KEY="sk-..." --project-ref $PROJECT_REF
supabase secrets set ANTHROPIC_API_KEY="sk-ant-..." --project-ref $PROJECT_REF
```

### Step 4: Verify (1 min)

```powershell
# Set environment variables
$env:SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_ANON_KEY = "eyJ..."
$env:AGENT_TOKEN = "your-agent-token"
$env:ORGANIZATION_ID = "your-org-uuid"

# Run verification
npx tsx scripts/verify-live-deployment.ts
```

## Troubleshooting

### Deploy fails with connection reset / `wsarecv` / `ERR_CONNECTION_RESET`

This is a **network/transport** issue talking to `api.supabase.com` (not your code). Recommended steps:

1. Run the auth refresh sequence: [DEPLOYMENT_MAGIC.md](DEPLOYMENT_MAGIC.md)
2. Retry deploy with `--debug` (often succeeds on a later attempt)
3. If it persists: switch networks (mobile hotspot), disable VPN/proxy, or retry later

PowerShell retry loop (bounded):

```powershell
$PROJECT_REF = "YOUR_PROJECT_REF"
$MAX = 8
for ($i = 1; $i -le $MAX; $i++) {
  Write-Host "Deploy attempt $i/$MAX..."
  npx supabase functions deploy generate-course --project-ref $PROJECT_REF --no-verify-jwt --debug
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 5
}
```

### `verify-live-deployment.ts` says `SUPABASE_URL` / `SUPABASE_ANON_KEY` missing

- Ensure `supabase/.deploy.env` contains **both** `SUPABASE_URL` and `SUPABASE_ANON_KEY` (copy from `supabase/.deploy.env.example`).
- Or set them in your shell before running verify.
- The verifier also reads `learnplay.env` (gitignored) for convenience, but env vars win.

### Function Returns 503

Check [EDGE_DEPLOYMENT_RUNBOOK.md](EDGE_DEPLOYMENT_RUNBOOK.md) for:
- Import patterns (must use `npm:` specifier)
- CORS handling (use `{ stdHeaders, handleOptions }`)
- Supabase client initialization (top level)

### Function Returns 401

- Verify AGENT_TOKEN matches between secret and request
- Check `x-agent-token` header is sent correctly

### Function Returns 404

- Function not deployed - run deploy script again
- Check function name matches exactly

## Full Documentation

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.


