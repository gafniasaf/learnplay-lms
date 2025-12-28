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
- **Note**: Docker Desktop is **automatically started** when needed. If you encounter issues, manually check Docker with `npm run docker:check` or start it with `npm run docker:start`.
- **Manual Docker start**: If auto-start fails, open Docker Desktop manually from the Start menu.


