## Operator Manual – Ignite Zero Seed

This document is a lightweight guide for running and operating the **Ignite Zero** seed locally.

### Bootstrapping

- **Install dependencies**: `npm install`
- **Run MCP server (if needed)**: follow `docs/cursor-mcp-mode.md` for your environment.
- **Start the app**: `npm run dev` and open `http://localhost:5173/architect`.

### Verification

- **Full check**: `npm run verify` (types + unit tests + universal E2E presence).
- **Dead-code audit**: `npm run audit` (Knip-based analysis; see `reports/dead-code.txt`).

### Troubleshooting

- **Local DB reset**: `supabase db reset --yes`
- **Note**: If `supabase db reset` fails locally, ensure **Docker Desktop is running**. This command only affects the **local simulator**, not the code artifact.


