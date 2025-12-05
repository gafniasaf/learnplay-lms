### Secrets and Tokens Policy

This repository uses a single Agent token for privileged calls from MCP/Edge Functions to the Supabase control plane. Do not commit secrets to the repo. Use the following canonical locations:

- Supabase (Edge Functions): project secret `AGENT_TOKEN` (set via `supabase secrets set`)
- GitHub Actions (CI): repository secret `AGENT_TOKEN`
- Local MCP server: `lms-mcp/.env.local` (ignored), with `AGENT_TOKEN=...`
- Team password vault (recommended): store the same token string with a clear name (e.g. “LMS | Agent Token | Prod”)

Rotation procedure (non‑interactive):

1) Generate a new token (64 hex chars) and set it in Supabase:

```bash
SUPABASE_PROJECT_REF=<your_project_ref> \
node scripts/agent-token-rotate.mjs
```

2) The script will attempt to:
- Update Supabase secret `AGENT_TOKEN`
- Update GitHub repo secret `AGENT_TOKEN` (requires `gh` CLI auth)
- Update `lms-mcp/.env.local` (if file exists)
- Print a masked confirmation

3) Update the team vault record with the new value. Never paste tokens into issues/PRs.

Notes:
- Edge redeploy is not required for secrets to take effect, but long‑lived instances may need a cold start.
- Keep `AGENT_TOKEN` identical across Supabase and CI to avoid mismatch errors.


