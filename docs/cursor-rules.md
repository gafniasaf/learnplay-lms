# MCP‑First Control Plane Rule (Mirrored)

This document mirrors the rule you’ve set in Cursor Settings so it is tracked in version control and can be referenced by CI, code reviews, and docs.

## Rule

- Always use MCP for inspect/orchestrate:
  `lms.health → lms.listJobs/getJob → lms.enqueueJob/lms.enqueueAndTrack → lms.applyJobResult → lms.listMediaJobs/getMediaJob/enqueueMedia`.

- Preflight before actions:
  Call `lms.health`; if not ok, run diagnostics (`lms.listJobs`, `lms.getJob`, `lms.logs`) and stop. Do not guess.

- Fallback policy (temporary only):
  Use direct Edge HTTP (with `X-Agent-Token`) only if `lms.health` fails or the MCP method does not exist.
  When falling back, log the reason and immediately create a task to add/repair the missing MCP method, then switch back to MCP.

- Secret handling:
  Never expose service role keys in the browser or client configs. All privileged flows go through MCP/Edge with `X-Agent-Token`.

- Testing/CI:
  Prefer MCP smoke/integration/e2e. Direct Edge calls are allowed only for diagnostics, not as the primary path.

## Auto‑Start Enforcement

- Before any MCP calls, ensure MCP is running locally:
  - Run: `npm run mcp:ensure` (auto-starts the Docker container if needed, then waits for health)
  - Cursor agents/tools should invoke `mcp:ensure` automatically when possible.

- Option B (dev‑only risky paths) may be enabled locally via environment:
  - `OPTION_B_ENABLED=1` in `lms-mcp/.env.local` and Supabase project secrets (dev only)

## Notes

- This file is the mirrored source for the Cursor rule and should remain consistent with Cursor Settings.
- If the rule in Cursor Settings changes, update this file in the same pull request.


