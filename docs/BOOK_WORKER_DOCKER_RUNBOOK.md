# Book Worker (Docker) Runbook

This runbook covers running the book worker (`book-worker/worker.mjs`) **as a Docker service**.

For the general execution-plane runbook, see `docs/BOOK_WORKER_RUNBOOK.md`.

## Quick start (Docker Compose)

1. Ensure Docker is running (Windows):

```powershell
npm run docker:start
```

2. Export required env vars in your shell (do **not** commit secrets):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `AGENT_TOKEN`

⚠️ If you run Supabase locally:
- Do **NOT** use `http://127.0.0.1:54321` inside Docker.
- Use: `http://host.docker.internal:54321`

3. Start the worker:

```powershell
docker compose -f docker-compose.book-worker.yml up -d --build
```

4. Watch logs:

```powershell
docker logs -f ignitezero-book-worker
```

5. Stop:

```powershell
docker compose -f docker-compose.book-worker.yml down
```

## Render providers (important)

Ignite Zero supports two book render providers (see `docs/BOOK_RENDER_PROVIDERS.md`):

- `prince_local`: renders using a Prince binary available to the worker.
- `docraptor_api`: sends HTML to DocRaptor (managed Prince).

### Option A: `prince_local` inside Docker

The base image `book-worker/Dockerfile` intentionally does **not** bundle Prince (licensing differs).

If you want Prince **inside** Docker:
- Provide your own **Linux Prince .deb** (gitignored)
- Build the derived image in `book-worker/Dockerfile.prince`
- Update `docker-compose.book-worker.yml` to use that Dockerfile (or set a different `image:`)

### Option B: `docraptor_api` (no Prince install)

If you enqueue jobs with `renderProvider: "docraptor_api"`:
- Set `DOCRAPTOR_API_KEY` in the container environment
- (Optional) `DOCRAPTOR_TEST_MODE=true`

⚠️ Data/privacy note: this ships HTML to DocRaptor. Review before production use.

## BookGen Pro (LLM) jobs

If you enqueue BookGen Pro jobs (`pipelineMode: "bookgen_pro"`), you must provide LLM keys depending on provider selection:

- `OPENAI_API_KEY` (required if provider is OpenAI for plan or rewrite)
- `ANTHROPIC_API_KEY` (required if provider is Anthropic for plan or rewrite)

## Troubleshooting

- **Worker can’t reach local Supabase**:
  - Symptom: connection refused / timeouts.
  - Fix: set `SUPABASE_URL=http://host.docker.internal:54321` (not `127.0.0.1`).

- **Jobs stuck in `processing`**:
  - Use the monitoring steps in `docs/BOOK_WORKER_RUNBOOK.md` (heartbeat, stale jobs, requeue).

- **`prince_local` jobs fail in Docker**:
  - You likely don’t have Prince installed in the container.
  - Fix: build with `book-worker/Dockerfile.prince`, or enqueue `docraptor_api` jobs.


