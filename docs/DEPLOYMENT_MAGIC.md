# 🧙‍♂️ Deployment Magic: How to Fix Stubborn 401s

**Problem:** You have a valid `SUPABASE_ACCESS_TOKEN`, but `supabase functions deploy` (or `projects list`) keeps returning `401 Unauthorized`.

**Root Cause:** The Supabase CLI caches auth state in `~/.supabase/`. If this cache gets stale or corrupted, the CLI might prioritize it over the environment variable, or get into a state where it refuses to authenticate properly.

## The Magic Fix Sequence

Run this EXACT sequence in your terminal to unblock deployment:

```powershell
# 0. Set/refresh your token (do NOT paste tokens into chat or commit history)
# $env:SUPABASE_ACCESS_TOKEN = "sbp_..."

# 1. Nuke the stale session
# NOTE: In Windows PowerShell 5.1, prefer putting global flags first:
npx supabase --yes logout

# 2. Explicitly re-hydrate the session with your token
npx supabase login --token $env:SUPABASE_ACCESS_TOKEN

# 3. Verify access (MUST return project list, not 401)
npx supabase projects list --debug

# 4. Run the standard deploy script
.\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env
```

## Why This Works
The `logout` command clears the corrupted local state. The `login --token` command forces the CLI to validate and store the token *explicitly*, ensuring subsequent commands (like `deploy`) rely on a fresh, valid auth context.

## If you see connection resets (not 401)

If `projects list` / `functions deploy` fails with errors like:
- `wsarecv: An existing connection was forcibly closed by the remote host`
- `ERR_CONNECTION_RESET`

This is usually a **network** issue reaching `api.supabase.com` (VPN/proxy/ISP/Cloudflare). Try:

1. Re-run the sequence above (auth refresh + retry)
2. Retry deploy with `--debug` (often succeeds on a later attempt)
3. Switch networks (mobile hotspot), disable VPN/proxy, or retry later

## Verification
After deployment, ALWAYS run the live verification script to ensure the new code is actually live:

```bash
npx tsx scripts/verify-live-deployment.ts
```
