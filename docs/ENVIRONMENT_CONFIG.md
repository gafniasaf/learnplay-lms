# Environment Configuration Guide

## Required Environment Variables

### Production (Live Mode)

**VITE_SUPABASE_URL** (Required)
- Description: Supabase project URL
- Format: `https://your-project.supabase.co`
- Example: `https://grffepyrmjihphldyfha.supabase.co`
- Validation: Must start with `https://` and end with `.supabase.co`

**VITE_SUPABASE_PUBLISHABLE_KEY** (Required)
- Description: Supabase publishable (public) API key
- Format: Long base64-encoded string starting with `eyJ`
- Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- Validation: Required for all Supabase client operations

### Optional Environment Variables

**VITE_USE_MOCK** (Optional, default: `undefined`)
- Description: Toggle between mock and live mode
- Values: `'true'` (mock mode) | `'false'` (live mode) | undefined (auto-detect)
- Note: Can be overridden at runtime via `?live=1` or localStorage

**VITE_USE_STORAGE_READS** (Optional, default: `undefined`)
- Description: Use direct Supabase Storage public URLs for catalog and courses
- Values: `'true'` | `undefined`
- Purpose: Bypasses edge functions for read-only operations (CORS workaround)
- Recommended: `'true'` in Lovable Cloud preview environments

**VITE_SENTRY_DSN** (Optional)
- Description: Sentry error tracking DSN
- Format: `https://<key>@<org>.ingest.sentry.io/<project>`
- Example: `https://abc123@o123456.ingest.sentry.io/789012`
- Validation: Must match format `https://...@...`

**VITE_ENABLE_DEV** (Optional, default: `undefined`)
- Description: Enable `/dev/tests` and `/dev/diagnostics` routes
- Values: `'true'` | undefined
- Note: Can be overridden at runtime via `?dev=1` or localStorage

**VITE_EMBED_ALLOWED_ORIGINS** (Optional)
- Description: Comma-separated list of allowed origins for iframe embedding
- Format: `https://domain1.com,https://domain2.com`
- Purpose: postMessage security for embedded mode

**VITE_FORCE_SAME_ORIGIN_PREVIEW** (Optional)
- Description: Force same-origin reads for read-only endpoints in preview environments to avoid CORS
- Values: `'true'` | undefined

**ORGANIZATION_ID** (Optional, MCP agent scope)
- Description: UUID that local MCP agents pass via `X-Organization-Id` so Edge Functions can enforce org-level isolation when using the agent token
- Format: `00000000-0000-0000-0000-000000000000`
- Usage: Required whenever Cursor agents issue writes through `lms-mcp`

## Edge Function Environment Variables

These are configured in Supabase Edge Functions settings (not in `.env`):

**OPENAI_API_KEY** (Required for AI generation)
- Description: OpenAI API key for course generation
- Format: `sk-proj-...` or `sk-...`
- Used by: `generate-course`, `ai-job-runner`

**ANTHROPIC_API_KEY** (Optional fallback)
- Description: Anthropic (Claude) API key
- Format: `sk-ant-...`
- Used by: `generate-course` (fallback if OpenAI unavailable)
- Model: `ANTHROPIC_MODEL` (default: `claude-3-5-sonnet-20241022`)

**SUPABASE_SERVICE_ROLE_KEY** (Auto-injected)
- Description: Supabase service role key for admin operations
- Automatically available in edge functions
- Used by: `ai-job-runner`, `ai-media-runner`

**ALLOWED_ORIGINS** (Optional)
- Description: Comma-separated list of allowed CORS origins for edge functions
- Default: `*` (all origins allowed in development)
- Production example: `https://yourapp.lovable.app,https://yourdomain.com`

**ALLOW_ALL_ORIGINS** (Optional)
- Description: Override CORS to allow all origins (dev only)
- Values: `'true'` | undefined
- Security: Never use in production

**ORIGINS_MODE** (Optional)
- Description: Controls origin validation behavior for edge functions
- Values: `'production'` (default) | `'dev'` | `'development'`
- Notes: In dev modes, missing or localhost origins are allowed for testing

**CORS_MODE** (Optional)
- Description: Adjusts CORS headers behavior for edge functions
- Values: `'standard'` (default) | `'loose'`
- Security: Do not use `'loose'` in production

## Environment Files

### `.env` (git-ignored, local development)
```env
# Development mode (uses mock data by default)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_ENABLE_DEV=true
```

### `.env.production` (git-ignored, local preview)
```env
# Production preview
VITE_USE_MOCK=false
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_USE_STORAGE_READS=true
VITE_SENTRY_DSN=https://...@sentry.io/...
```

### Lovable Cloud Configuration

1. **Dashboard → Settings → Environment Variables**
   - `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Your publishable key
   - `VITE_USE_STORAGE_READS`: `true` (required for preview CORS)
   - `VITE_SENTRY_DSN`: (optional) Your Sentry DSN

2. **Supabase → Project Settings → Edge Functions**
   - `OPENAI_API_KEY`: Your OpenAI key
   - `ANTHROPIC_API_KEY`: (optional) Your Anthropic key
   - `ALLOWED_ORIGINS`: Your preview and production domains

## Runtime Overrides

### URL Parameters
- `?live=1` — Force live mode (disable mocks)
- `?live=0` — Force mock mode
- `?dev=1` — Enable dev routes
- `?dev=0` — Disable dev routes

### localStorage
- `useMock`: `'true'` (mock) | `'false'` (live)
- `app.dev`: `'1'` (enabled) | `'0'` (disabled)
- `app.embedAllowed`: Comma-separated origins

### Priority Order
1. localStorage override
2. URL parameter (persisted to localStorage on boot)
3. Environment variable
4. Default value

## Validation

Environment validation runs at app startup (`src/lib/env.ts`):

```typescript
import { validateEnv } from '@/lib/env';

// In main.tsx or App.tsx
validateEnv(); // Throws if critical vars missing in live mode
```

**Live Mode Requirements:**
- `VITE_SUPABASE_URL` must be present
- `VITE_SUPABASE_PUBLISHABLE_KEY` must be present
- `VITE_SENTRY_DSN` (if set) must match format `https://...@...`

**Mock Mode:**
- All variables optional
- Warning logged if Supabase vars missing

## Secrets Rotation Playbook

### Supabase Keys Rotation

1. **Generate new keys** in Supabase Dashboard → Settings → API
2. **Update environment variables:**
   - Lovable Cloud: Dashboard → Settings → Environment Variables
   - Local: `.env` file
   - CI/CD: GitHub Secrets (if applicable)
3. **Redeploy** application (Lovable auto-deploys on env change)
4. **Verify** functionality via `/dev/diagnostics`
5. **Revoke old keys** in Supabase Dashboard after 24-hour grace period

### OpenAI/Anthropic Keys Rotation

1. **Generate new key** in provider dashboard
2. **Update Supabase Edge Functions** environment variables
3. **Redeploy functions:** `npx supabase functions deploy` or wait for auto-deploy
4. **Test** AI generation in `/admin/courses/ai`
5. **Revoke old key** in provider dashboard

### Sentry DSN Rotation

1. **Generate new DSN** in Sentry project settings
2. **Update `VITE_SENTRY_DSN`** in all environments
3. **Redeploy** application
4. **Verify** error capture with a test error
5. **Archive old DSN** in Sentry

## Troubleshooting

### "Environment validation failed"
- Check `.env` file exists and has correct format
- Verify `VITE_` prefix on all frontend variables
- Ensure no trailing spaces or quotes around values
- Restart dev server after changes

### CORS errors in preview
- Set `VITE_USE_STORAGE_READS=true` in Lovable environment settings
- Verify `ALLOWED_ORIGINS` includes your preview domain in Supabase
- Check `/dev/diagnostics` for detailed CORS header inspection

### AI generation fails
- Verify `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in Supabase Edge Functions settings
- Check edge function logs: `npx supabase functions logs ai-job-runner`
- Test API keys directly via cURL (see API_REFERENCE.md)

### Sentry not capturing errors
- Verify `VITE_SENTRY_DSN` format and validity
- Check Sentry project is active and not quota-limited
- Test with: `window.__sentryDebug = true` in browser console

## Security Best Practices

1. **Never commit** `.env` or `.env.production` to git
2. **Rotate keys** every 90 days or on suspected compromise
3. **Use service role key** only in edge functions, never in client
4. **Restrict ALLOWED_ORIGINS** in production (no wildcards)
5. **Enable RLS** on all database tables
6. **Audit access logs** regularly in Supabase Dashboard
7. **Monitor Sentry** for suspicious error patterns

## References

- [README.md](../README.md) - Project overview and quickstart
- [src/lib/env.ts](../src/lib/env.ts) - Runtime configuration logic
- [Supabase Environment Variables](https://supabase.com/docs/guides/cli/config#managing-environment-variables)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

