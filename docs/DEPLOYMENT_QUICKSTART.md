# Deployment Quick Start

Quick reference for deploying IgniteZero to Supabase.

## Prerequisites Checklist

- [ ] Supabase project created
- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] Access to Supabase Dashboard
- [ ] AI provider API keys (OpenAI and/or Anthropic)

## 5-Minute Deployment

### Step 1: Configure Environment (2 min)

```powershell
# 1. Edit supabase/.deploy.env with your credentials
#    Get values from: Supabase Dashboard > Project Settings > API

# 2. Set access token
$env:SUPABASE_ACCESS_TOKEN = "sbp_YOUR_TOKEN_HERE"
#    Get from: Supabase Dashboard > Account > Access Tokens
```

### Step 2: Deploy Functions (2 min)

```powershell
# Run pre-flight check
.\scripts\deployment-checklist.ps1

# Deploy all functions
.\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env
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


