# Security Overview

This project runs primarily in the browser with Supabase as the backend. Key practices:

- Authentication: Supabase auth. Anonymous sessions for demo/dev. Role checks in edge functions.
- Authorization: Enforced via Row Level Security (RLS) in Postgres and explicit role gates in functions.
- Secrets: Never embed private keys in frontend. Use publishable key only. Configure secrets in Lovable/Supabase.
- CORS: Universal CORS wrapper on all edge functions. `ALLOWED_ORIGINS` limits origins; dev allows localhost.
- Error envelopes: `{ error: { code, message }, requestId }` across all error responses.
- Sentry: Optional DSN; PII-light usage, replay masks text and blocks media.

## Local/Dev
- Mock mode enabled by default; env validation is softened (no hard fail).
- Live mode requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Reporting
Please open a GitHub issue with a minimal reproduction (avoid sharing secrets). For sensitive reports, contact maintainers privately.


