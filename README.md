# 🔥 Ignite Zero

**The Self-Replicating Software Factory.**

Ignite Zero is an Agent-Native seed architecture designed to build itself.
It uses a **Manifest-First** approach to generate UI, Database Schemas, and AI Logic.

## 🚀 Getting Started

**First Time Here?** Run the setup wizard to configure everything:

```bash
npm run setup
```

## 🛠️ Ignite CLI

We provide a unified CLI for all development tasks:

```bash
npx ignite <command>
```

| Command | Description |
|---------|-------------|
| `npx ignite verify` | **Run System Audit** (Types, Lint, Contracts, Tests) |
| `npx ignite scaffold` | **Regenerate Code** from `system-manifest.json` |
| `npx ignite test` | Run Unit & Contract Tests |
| `npx ignite deploy` | Deploy Edge Functions to Supabase |

## 🏗️ Architecture

- **Control:** Custom Local MCP Server (`lms-mcp`)
- **Logic:** Strategy Pattern Edge Functions (`ai-job-runner`)
- **State:** Hybrid JSON Storage + Supabase
- **Contracts:** `src/lib/contracts.ts` (Auto-generated from Manifest)

### Verification
Always run `npx ignite verify` before committing code. This ensures:
1. TypeScript compiles
2. Contracts match the Manifest
3. No forbidden fallback patterns are used

## 🧠 Local Dev Workflow

1. **Start Stack:** `npm run dev:up`
2. **Build:** Open `http://localhost:5173/`
3. **Describe:** Use the workspace UI to define your system
4. **Scaffold:** `npx ignite scaffold` (if you change the manifest manually)

## Deployment

### Production Build
```bash
npm run build
npm run preview
```

### Lovable Deployment
1. Click **Publish** in Lovable
2. App deploys to `yoursite.lovable.app`

### Environment Variables
See `docs/ENVIRONMENT_CONFIG.md`.

**Required:**
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## License
MIT

**Built with [Lovable](https://lovable.dev) 💜**
