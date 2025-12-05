# 🔥 Ignite Zero

**The Self-Replicating Software Factory.**

Ignite Zero is an Agent-Native seed architecture designed to build itself.
It uses a **Manifest-First** approach to generate UI, Database Schemas, and AI Logic.

## 🚀 Getting Started

**First Time Here?** Run the setup wizard to configure everything (Node, Docker, Supabase, MCP) automatically:

```bash
npm run setup
```

This script will:
1. Check prerequisites (installing if needed).
2. Initialize the local Supabase stack.
3. Configure the MCP Control Plane.
4. Install dependencies.

**Once setup is complete:**

1. **Ignite:** Run `npm run dev:up` to start the full stack.
2. **Build:** Open `http://localhost:5173/architect`.
3. **Describe:** Define your system in the Architect Console.

## 🧠 Local Dev Workflow

- Use `npm run factory` for a non-technical launcher. It shows a simple menu:
  - “Start Factory” → runs `npm run dev:up`
  - “Run System Check” → runs `npm run verify`
  - No Docker/Node knowledge required—just press `1` or `2`.
- If you prefer the direct command, `npm run dev:up` boots Vite **and** ensures the local MCP server is running.
- If you only need the control plane, run `npm run mcp:ensure` directly; the MCP health checks (tests/integration/mcp-health.spec.ts) now fail fast if that server isn’t reachable.
- Before running any dev server, run `npm run preflight` (automatically included in `dev:up`). It warns you if critical Supabase secrets (service role key) are missing so resume logging doesn’t silently fail.
- Want a ready-to-go ZIP? Visit `/setup` after setting `VITE_RELEASE_ZIP_URL` to your hosted bundle (Supabase Storage URL works great). The page walks non-coders through unzip → link to Cursor → run commands.

## 🏗️ Architecture

- **Control:** Custom Local MCP Server (`lms-mcp`).
- **Logic:** Strategy Pattern Edge Functions (`ai-job-runner`).
- **State:** Hybrid JSON Storage + Supabase.

Verification: Run `npm run audit` (using Knip if installed) or `npm run verify`.
Ensure the build is Green and no **"Course"** terminology remains in the active code path.
- Reads catalog and courses directly from Supabase Storage public URLs
- Bypasses edge functions for read-only operations (solves CORS in Lovable preview)
- Write operations (AI generation) still use job queue + edge functions

## Deployment

### Production Build
```bash
npm run build
npm run preview  # Test production build locally
```

### Lovable Deployment
1. Click **Publish** button in Lovable editor
2. Your app deploys to `yoursite.lovable.app`
3. Custom domains available on paid plans

### Environment Variables
See [docs/ENVIRONMENT_CONFIG.md](docs/ENVIRONMENT_CONFIG.md) for complete guide.

**Required for production:**
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

**Recommended for preview:**
```
VITE_USE_STORAGE_READS=true  # Bypass edge functions for read operations
```

**Optional:**
```
VITE_SENTRY_DSN=https://...@sentry.io/...  # Error tracking
VITE_ENABLE_DEV=true  # Enable /dev routes (access via ?dev=1)
```

**Edge Functions (Supabase settings):**
```
OPENAI_API_KEY=sk-proj-...  # Required for AI generation
ANTHROPIC_API_KEY=sk-ant-...  # Optional fallback
ALLOWED_ORIGINS=https://yourapp.lovable.app  # CORS
```

## Contributing

### Adding a New Feature

1. **Database changes:** Create migration
   ```sql
   -- supabase/migrations/<timestamp>_feature.sql
   CREATE TABLE ...;
   ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
   CREATE POLICY ...;
   ```

2. **Edge function:** Create in `supabase/functions/`
   ```typescript
   import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
   import { checkOrigin } from "../_shared/origins.ts";
   
   serve(async (req) => {
     if (req.method === "OPTIONS") return handleOptions();
     const bad = checkOrigin(req);
     if (bad) return bad;
     // ... implementation
   });
   ```

3. **API client:** Add to `src/lib/api/`
   ```typescript
   export async function myFeature(): Promise<Data> {
     return callEdgeFunctionPost("my-feature", { payload });
   }
   ```

4. **Component:** Create in `src/components/` or `src/pages/`

5. **Tests:** Add to `src/lib/tests/`

### Code Style
- Use TypeScript strict mode
- Follow existing patterns for consistency
- Add JSDoc comments for complex functions
- Keep functions small and focused
- Prefer composition over inheritance

## Troubleshooting

### Common Issues

**Build errors:**
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check TypeScript errors: `npm run typecheck`

**Auth issues:**
- Verify `.env` has correct Supabase credentials
- Check Supabase dashboard for user existence
- Enable email auto-confirm in Supabase Auth settings

**Caching issues:**
- Clear localStorage: `localStorage.clear()`
- Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
- Check Network tab for 304 responses

**Edge function errors:**
- View logs: `npx supabase functions logs <function-name>`
- Check CORS headers are set correctly
- Verify origin is in `ALLOWED_ORIGINS` env var

### Supabase Migrations & Secrets
- If `supabase db push` complains that an old migration already exists (e.g., `ai_agent_jobs`), mark it as applied before rerunning:
  ```bash
  supabase migration repair --status applied 20240101000000
  supabase db push
  ```
- Resume logging requires the service role key to be configured for edge functions. Set it once per project:
  ```bash
  supabase secrets set SERVICE_ROLE_KEY=your_service_role_key
  ```
  (Use `SUPABASE_SERVICE_ROLE_KEY` if running locally; the preflight script checks both env names.)
- Architect LLM model: by default we call `gpt-4o`. Override via `ARCHITECT_LLM_MODEL` (or `OPENAI_MODEL`) if you have access to a newer tier (e.g., `gpt-5.1-high-fast`):
  ```bash
  supabase secrets set ARCHITECT_LLM_MODEL=gpt-5.1-high-fast
  ```
- Crucible artifacts: `npm run test:architect` writes failing cases to `artifacts/architect-crucible/<id>.json`. Clean the folder between runs if desired.
- PLAN.md cloud copy: the download button also uploads the plan to Supabase Storage. Configure bucket (default `plans`) by ensuring it exists + public, or override via `VITE_PLAN_BUCKET`. Share the generated link with Cursor so it can fetch PLAN.md directly.
- If the bucket is missing, run `npm run storage:setup` (wraps `supabase storage create-bucket plans --public --if-not-exists`). You can copy/paste this command into Cursor’s shell if you prefer.
- Cursor handoff helper: On the Execution step, use “Copy Cursor Instructions” to grab a ready-to-paste message (includes the public PLAN.md link when available). Share that text in Cursor so it immediately downloads the right plan file.
- Secure bundle download: `/setup` now calls the `download-release` Edge Function, which checks the Supabase session and returns a signed URL for the private `releases/ignite-zero-release.zip` object. Set `RELEASE_BUCKET`, `RELEASE_OBJECT`, and `SUPABASE_SERVICE_ROLE_KEY` secrets before deploying the function.
- PowerShell installer: Fetch `/install-factory.ps1` after logging in, then run it with the signed link that `/setup` shows you:  
  `.\install-factory.ps1 -ReleaseUrl "<signed-url>"`. The script still installs Git, Node, Docker Desktop, Supabase CLI, etc.
- Publish a fresh ZIP at any time with `npm run release:publish`. The script `git archive`s the repo, uploads it to the `releases` bucket via the Supabase CLI, cleans up the local ZIP, updates `.env.local`, and rewrites `/install-factory.ps1` with the latest download link. Make sure `supabase login` / `supabase link` are configured first.
- Access control: `/architect`, `/setup`, and `/my-app` are now protected routes. Users must sign in via Supabase Auth before accessing the Architect console, secure download links, or stored plans/logs.

For more help, see [Troubleshooting Guide](https://docs.lovable.dev/tips-tricks/troubleshooting).

## License

MIT

## Support

- [Lovable Documentation](https://docs.lovable.dev/)
- [Discord Community](https://discord.com/channels/1119885301872070706/1280461670979993613)
- [GitHub Issues](../../issues)

---

**Built with [Lovable](https://lovable.dev) 💜**
