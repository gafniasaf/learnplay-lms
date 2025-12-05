# Edge Functions Environment Variables

This document lists the required environment variables for each edge function in the project.

## Global Requirements

Common environment variables used by functions:

- `SUPABASE_URL` - The Supabase project URL
- `SUPABASE_ANON_KEY` - Used by endpoints that authenticate requests via the Authorization header
- `SUPABASE_SERVICE_ROLE_KEY` - Used by privileged endpoints that perform server-side operations (bypass RLS)
- `ALLOWED_ORIGINS` (optional) - Comma/space-separated list of allowed origins for CORS
- `ORIGINS_MODE` (optional) - `production` (default) | `dev` | `development` for origin checks
- `CORS_MODE` (optional) - `standard` (default) | `loose` to relax CORS in dev

## Function-Specific Requirements

### join-class

**Purpose**: Allows students to join a class using a join code.

**Required Environment Variables**:
- `SUPABASE_URL` - For creating Supabase client instances
- `SUPABASE_ANON_KEY` - For user authentication verification
- `SUPABASE_SERVICE_ROLE_KEY` - For executing privileged RPC calls that bypass RLS

**Error Behavior**:
- If any required variable is missing, the function returns a `500` status with error code `config_error`
- The response includes the names of missing variables in the error message
- All validation failures are logged with the request ID for traceability

**Example Error Response**:
```json
{
  "error": {
    "code": "config_error",
    "message": "Server misconfiguration: Missing required environment variables: SUPABASE_SERVICE_ROLE_KEY"
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-01-20T12:34:56.789Z"
}
```

## Configuration

### Lovable Cloud

Environment variables are automatically configured when using Lovable Cloud. No manual setup required.

### Local Development

For local development with Supabase CLI:

1. Create `supabase/.env.local` (gitignored):
```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

2. The Supabase CLI will automatically load these variables when running functions locally.

### Production Deployment

When deploying to Supabase:

```bash
# Set secrets via CLI
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Or via Supabase Dashboard:
# Project Settings → Edge Functions → Secrets
```

## Validation

Each function validates its required environment variables on every request before processing. This ensures:

- **Fail-fast behavior**: Configuration errors are caught immediately
- **Clear error messages**: Missing variables are explicitly listed
- **Request traceability**: All validation failures include request IDs
- **Security**: Prevents functions from running with incomplete configuration

## Best Practices

1. **Never commit secrets**: Environment files containing secrets should be in `.gitignore`
2. **Use service role sparingly**: Only functions that need to bypass RLS should use `SUPABASE_SERVICE_ROLE_KEY`
3. **Validate early**: Check environment variables before any business logic
4. **Log validation failures**: Always log missing variables with request context
5. **Document requirements**: Update this file when adding new functions or environment variables

## Troubleshooting

### Function returns 500 with config_error

**Symptoms**: Function immediately returns 500 status with error code `config_error`

**Causes**:
- Missing required environment variable
- Empty environment variable value
- Incorrect variable name (typo)

**Solutions**:
1. Check the error message for the list of missing variables
2. Verify variables are set in your deployment environment
3. For Lovable Cloud: Check that Cloud integration is properly connected
4. For local dev: Ensure `supabase/.env.local` exists and is properly formatted
5. For Supabase: Verify secrets are set via CLI or dashboard

### Changes to environment variables not reflected

**Solutions**:
1. Restart the Supabase local development server
2. Redeploy the edge function to production
3. Verify secrets were saved (check Supabase dashboard or use `supabase secrets list`)

### `supabase functions deploy` returns `{"message":"Unauthorized"}`

This usually means the CLI token cannot manage the target project (even if you are the project owner).

**Checklist to unblock deployments:**

1. **Upgrade the CLI** – We ship the project assuming Supabase CLI v2.62+ (`scoop install supabase` on Windows). Older v1 binaries often fail with 401.
2. **Use a Personal Access Token (PAT)** –
    - In the Supabase dashboard for the org that owns your project, create a Personal Access Token with full access.
    - **CRITICAL**: If `supabase login --token <pat>` fails or still results in 401, set the environment variable explicitly.
    - PowerShell: `$env:SUPABASE_ACCESS_TOKEN="sbp_..."`
    - Bash: `export SUPABASE_ACCESS_TOKEN="sbp_..."`
3. **Recover Lost Tokens (Emergency)** –
    - If you don't have a token but suspect a previous agent used one, search the terminal history:
    - Command: `findstr /s "sbp_" ".cursor/projects/*/terminals/*"`
    - Use the most recent token found.
4. **Verify permissions** – Run `supabase functions list --project-ref <project_ref>` with the env var set. It must succeed.
5. **Run the bulk deploy** – `.\scripts\ci\deploy-functions.ps1 -EnvPath supabase/.deploy.env`.

### Import Errors: `Relative import path ... not prefixed`

**Symptoms**: Deployment fails with:
`Relative import path "@supabase/supabase-js" not prefixed with / or ./ or ../`

**Cause**: Deno requires explicit npm specifiers for modules not in a literal import map.

**Solution**:
Change imports from:
`import { createClient } from '@supabase/supabase-js';`
To:
`import { createClient } from 'npm:@supabase/supabase-js@2';`

### `failed to create the graph`

**Symptoms**: `Error: failed to create the graph` during bundling.
**Cause**: One of the imports in the file (or its dependencies) is malformed or unresolvable by Deno.
**Solution**: Check imports in all dependencies. E.g., if `enqueue-job` fails but its `index.ts` looks fine, check if it imports a shared strategy file that has bad imports.

## Security Notes

- `SUPABASE_ANON_KEY` is safe to expose to clients (it's rate-limited and RLS-protected)
- `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS policies and should only be used in edge functions
- Never log the actual values of secret environment variables
- Always validate and sanitize user input even when using service role key
