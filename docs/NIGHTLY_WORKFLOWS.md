# Nightly Workflows Analysis

## Overview
The repository has **9 scheduled nightly workflows** that run automatically to monitor system health, test integrations, and detect regressions.

## Current Nightly Workflows

| Workflow | Schedule | Purpose | Why It Might Fail |
|----------|----------|---------|-------------------|
| **Nightly Self-Heal** | 03:00 UTC | Comprehensive integration tests (MCP, pipeline, editor E2E) | Requires Docker, MCP server, multiple secrets |
| **UI Dead CTA Nightly** | 02:00 UTC | Detects dead/unreachable CTAs in UI | Requires UI build and analysis |
| **CTA Coverage** | 02:00 UTC | Computes CTA proxy coverage metrics | Requires CTA analysis scripts |
| **MCP Jobs Health** | 06:30 UTC | Checks MCP job queue health | Requires MCP server running |
| **MCP Guards Auth Smoke** | 06:00 UTC | Tests MCP authentication and edge functions | Requires MCP server + secrets |
| **MCP Guards Extended** | 07:00 UTC | Extended MCP guard tests | Requires MCP server + secrets |
| **RLS Fuzz** | 02:30 UTC | Fuzz tests Row Level Security policies | Requires Supabase connection |
| **Scenarios** | 02:15 UTC | Runs scenario-based tests | Requires test scenarios |
| **UI Proxy Smoke** | 03:00 UTC | Tests UI proxy functionality | Requires proxy server |

## Why They're Failing

1. **Missing Secrets**: Many workflows require GitHub Actions secrets that aren't configured:
   - `MCP_AUTH_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AGENT_TOKEN`
   - `TEST_COURSE_ID`
   - `MCP_BASE_URL`

2. **Missing Services**: Some workflows require services that aren't available in CI:
   - MCP server (Docker container)
   - Live Supabase instance
   - Proxy server

3. **Development Phase**: These workflows are designed for **production monitoring**, not development.

## Do We Need Them?

### ✅ **Keep for Production**
- **Nightly Self-Heal**: Critical for catching regressions in production
- **MCP Jobs Health**: Important for monitoring job queue health
- **RLS Fuzz**: Important for security testing

### ⚠️ **Optional/Can Disable**
- **UI Dead CTA Nightly**: Useful but not critical
- **CTA Coverage**: Metrics gathering, can run manually
- **MCP Guards**: Useful but redundant with other tests
- **Scenarios**: Can run manually when needed
- **UI Proxy Smoke**: Can be part of regular CI

## Recommendation

**For Development Mode:**
1. **Disable all nightly workflows** temporarily
2. Keep `ci-jest.yml` (runs on push/PR) - this is sufficient for development
3. Re-enable when moving to production

**For Production:**
1. Configure all required secrets in GitHub Actions
2. Set up MCP server infrastructure
3. Enable workflows gradually, starting with critical ones

## How to Disable Nightly Workflows

Option 1: Comment out the `schedule` section in each workflow file
Option 2: Delete the workflow files (can restore from git if needed)
Option 3: Add a condition to skip if secrets are missing

