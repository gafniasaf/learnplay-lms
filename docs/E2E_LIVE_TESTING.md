# Live E2E Testing Guide

This guide explains how to run end-to-end tests with **real Supabase** and **real LLM calls** (no mocks).

## Overview

The live E2E tests (`tests/e2e/live-*.spec.ts`) test the actual application with:
- ✅ **Real Supabase** database and Edge Functions
- ✅ **Real LLM APIs** (OpenAI/Anthropic)
- ✅ **Real authentication** flows
- ✅ **Real job creation** and processing

These tests catch integration issues that mock-based tests miss.

## Prerequisites

1. **Admin Account**: Must exist in Supabase
   ```bash
   npm run scripts/create-admin.ts admin@learnplay.dev AdminPass123! "Admin User"
   npm run scripts/setup-admin-org.ts admin@learnplay.dev
   ```

2. **Environment Variables**: Supabase credentials must be available
   - Either in `learnplay.env` (auto-detected)
   - Or set as environment variables:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`

3. **LLM API Keys** (optional, for job creation tests):
   - `VITE_OPENAI_API_KEY`
   - `VITE_ANTHROPIC_API_KEY`

## Running Live E2E Tests

### Basic Usage

```bash
# Run all live E2E tests
npm run e2e:live

# Run with browser visible (headed mode)
npm run e2e:live:headed

# View test report
npm run e2e:live:report
```

### What Gets Tested

The live E2E tests cover:

1. **Admin Authentication**
   - Login with correct credentials
   - Login failure with wrong password
   - Session persistence

2. **Job Creation**
   - Create jobs via Quick Start panel
   - Real LLM API calls
   - Job status tracking

3. **Admin Pages Access**
   - `/admin` dashboard
   - `/admin/courses`
   - `/admin/jobs`
   - `/admin/metrics`

4. **Error Handling**
   - 401 Unauthorized errors
   - CORS errors in preview environments
   - User-friendly error messages

## Test Structure

```
tests/e2e/
├── admin.setup.ts          # Authenticates as admin before tests
├── live-admin-jobs.spec.ts # Main live E2E tests
└── ...other tests...
```

### Setup Project

The `admin.setup.ts` file runs first to create an authenticated session:

```typescript
// Automatically logs in as admin and saves session
// Session saved to: playwright/.auth/admin.json
```

### Authenticated Tests

Tests marked with `test.use({ storageState: 'playwright/.auth/admin.json' })` use the authenticated session.

## Configuration

The live E2E config (`playwright.live.config.ts`) uses:

- **Port**: 8082 (different from mock tests on 8080)
- **Mode**: `VITE_USE_MOCK=false` (real services)
- **Timeout**: 180s (for real LLM calls)
- **Screenshots**: On (for debugging)
- **Video**: On failure (for debugging)

## Debugging Failed Tests

1. **View Screenshots**: Check `test-results/` directory
2. **View Video**: Check `test-results/` for `.webm` files
3. **View Trace**: Run with `--trace on` flag
4. **Run Headed**: Use `npm run e2e:live:headed` to see browser

## CI/CD Integration

For CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Live E2E Tests
  env:
    VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
    E2E_ADMIN_EMAIL: ${{ secrets.ADMIN_EMAIL }}
    E2E_ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
  run: npm run e2e:live
```

## Cost Considerations

⚠️ **Warning**: Live E2E tests use real APIs and may incur costs:
- **Supabase**: Minimal (Edge Function invocations)
- **LLM APIs**: Can be expensive if running frequently
  - OpenAI: ~$0.01-0.10 per test run
  - Anthropic: ~$0.01-0.10 per test run

**Recommendation**: Run live E2E tests:
- Before releases
- On pull requests (with rate limiting)
- Not on every commit

## Troubleshooting

### "Admin account not found"
```bash
# Create admin account
npm run scripts/create-admin.ts admin@learnplay.dev AdminPass123! "Admin User"
npm run scripts/setup-admin-org.ts admin@learnplay.dev
```

### "Missing Supabase credentials"
- Check `learnplay.env` exists
- Or set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars

### "401 Unauthorized" errors
- Admin account may not have `organization_id` set
- Run `npm run scripts/setup-admin-org.ts admin@learnplay.dev`

### Tests timeout
- Real LLM calls can take 30-90 seconds
- Increase timeout in `playwright.live.config.ts` if needed

## Comparison: Mock vs Live Tests

| Feature | Mock Tests (`npm run e2e`) | Live Tests (`npm run e2e:live`) |
|---------|---------------------------|--------------------------------|
| Supabase | Mocked | Real |
| LLM APIs | Mocked | Real |
| Speed | Fast (~30s) | Slow (~3-5min) |
| Cost | Free | May incur API costs |
| Use Case | Fast feedback | Pre-release validation |

## Best Practices

1. **Run mock tests frequently** (on every commit)
2. **Run live tests before releases** (before merging to main)
3. **Use live tests for debugging** production issues
4. **Monitor API costs** if running frequently
5. **Keep admin credentials secure** (use secrets in CI/CD)


