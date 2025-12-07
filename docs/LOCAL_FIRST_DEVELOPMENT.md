# Local-First Development Guide

**For solo developers building multiple projects on Ignite Zero**

This guide optimizes the Ignite Zero workflow for local development, reducing cloud costs and speeding up iteration.

## 🎯 Philosophy

**Develop locally → Validate in cloud → Deploy**

- **90% local**: Database, frontend, MCP server, AI strategies
- **10% cloud**: Edge Functions validation, final integration tests

## 🚀 Quick Start

### 1. Initial Setup

```bash
# Start local Supabase
supabase start

# Configure for local development
./scripts/dev-local.sh

# Start MCP server (in one terminal)
cd lms-mcp && npm run dev

# Start frontend (in another terminal)
npm run dev
```

### 2. Daily Development Workflow

```bash
# Morning: Reset local DB if needed
supabase db reset --local

# Develop normally - everything runs locally
# - Frontend: http://localhost:5173
# - Supabase: http://localhost:54321
# - MCP: http://localhost:4000

# Test Edge Functions locally (optional)
supabase functions serve <function-name> --env-file supabase/.env.local
```

### 3. Before Production

```bash
# Switch to cloud for validation
export SUPABASE_PROJECT_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key
./scripts/dev-cloud.sh

# Deploy Edge Functions
./scripts/ci/deploy-functions.ps1 -EnvPath supabase/.deploy.env

# Verify deployment
npx tsx scripts/verify-live-deployment.ts

# Run integration tests
npm run test:chat
npm run verify:live
```

## 📁 Project Structure

When starting a new project based on Ignite Zero:

```
my-new-project/
├── .env.local              # Local config (gitignored)
├── lms-mcp/
│   └── .env.local          # MCP local config
├── supabase/
│   ├── .env.local          # Edge Functions local config
│   └── migrations/         # SQL migrations (test locally first)
└── scripts/
    ├── dev-local.sh        # Switch to local mode
    └── dev-cloud.sh        # Switch to cloud mode
```

## 🔧 Local Development Features

### ✅ What Works Locally

1. **Database Operations**
   - All SQL migrations
   - RLS policies
   - Functions and triggers
   - Full PostgreSQL features

2. **Frontend Development**
   - All React components
   - State management
   - API calls to local Supabase
   - Storage operations (local storage)

3. **MCP Server**
   - Local runner mode (`USE_LOCAL_RUNNER=true`)
   - AI strategies execute in Node.js
   - No Edge Function deployment needed
   - Faster iteration

4. **Edge Functions (Optional)**
   - `supabase functions serve` for testing
   - Local Deno runtime
   - Can test before deploying

### ⚠️ Limitations

1. **Storage URLs**
   - Local: `http://localhost:54321/storage/v1/object/public/...`
   - Cloud: `https://project.supabase.co/storage/v1/object/public/...`
   - Frontend code should use env vars, not hardcoded URLs

2. **Authentication**
   - Local auth works, but JWT secrets differ
   - Test auth flows in cloud before production

3. **Edge Function Differences**
   - Local Deno may behave slightly differently
   - Always validate in cloud before production

## 💰 Cost Optimization

### Local Development
- **Cost**: $0 (runs on your machine)
- **Speed**: Instant (no network latency)
- **Isolation**: Complete (your own DB state)

### Cloud Validation
- **Cost**: Minimal (only when validating)
- **Frequency**: Before production, or weekly integration tests
- **Purpose**: Catch deployment issues early

## 🔄 Workflow Comparison

### Cloud-First (Original)
```
Code → Deploy → Test → Fix → Deploy → Test → ...
```
- Slow iteration (deployment overhead)
- Higher cloud costs
- Catches deployment issues early

### Local-First (Recommended)
```
Code → Test Locally → Fix → Test Locally → ... → Deploy → Validate → Done
```
- Fast iteration (no deployment)
- Lower costs (local is free)
- Deploy only when ready

## 🛠️ Troubleshooting

### Local Supabase Won't Start

```bash
# Check Docker is running
docker ps

# Reset Supabase
supabase stop
supabase start

# Check ports
# Supabase uses: 54321 (API), 54322 (DB), 54323 (Studio)
```

### MCP Server Can't Connect

```bash
# Verify local Supabase is running
supabase status

# Check .env.local has correct URL
cat lms-mcp/.env.local | grep SUPABASE_URL
# Should be: http://localhost:54321
```

### Edge Functions Fail Locally

```bash
# Check Deno is installed
deno --version

# Serve function with env vars
supabase functions serve <name> --env-file supabase/.env.local

# Check imports use npm: specifier
# ❌ import { createClient } from '@supabase/supabase-js'
# ✅ import { createClient } from 'npm:@supabase/supabase-js@2'
```

## 📋 Checklist: Starting New Project

- [ ] Clone Ignite Zero template
- [ ] Run `supabase start`
- [ ] Run `./scripts/dev-local.sh`
- [ ] Update `system-manifest.json` for your domain
- [ ] Run `npx tsx scripts/scaffold-manifest.ts`
- [ ] Start MCP: `cd lms-mcp && npm run dev`
- [ ] Start frontend: `npm run dev`
- [ ] Develop locally (90% of work)
- [ ] Before production: Switch to cloud, deploy, validate

## 🎓 Best Practices

1. **Always use environment variables**
   - Never hardcode URLs
   - Use `import.meta.env.VITE_SUPABASE_URL`

2. **Test migrations locally first**
   - `supabase db reset --local` is your friend
   - Verify SQL before deploying

3. **Use local runner for AI strategies**
   - Set `USE_LOCAL_RUNNER=true`
   - Faster than deploying Edge Functions
   - Same code path (registry.ts)

4. **Deploy Edge Functions only when needed**
   - Most development doesn't need them
   - Deploy before production validation

5. **Keep cloud project for validation**
   - One cloud project per "real" project
   - Use for final testing before production

## 🔗 Related Docs

- `docs/EDGE_DEPLOYMENT_RUNBOOK.md` - Edge Function deployment
- `docs/ENVIRONMENT_CONFIG.md` - Environment variable reference
- `docs/GOLDEN_PLAN_FACTORY_GUIDE.md` - Local runner mode details
