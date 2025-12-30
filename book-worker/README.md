# Book Render Worker (Docker)

This is the **Execution Plane** worker for the Ignite Zero book pipeline. It:

- Polls `book-claim-job` for pending jobs
- Downloads canonical inputs via `book-version-input-urls` (signed URLs)
- Downloads optional inputs via `book-version-input-urls`:
  - `figures.json` (optional)
  - `design_tokens.json` (optional)
  - `assets.zip` (optional but REQUIRED if your canonical references local images or chapter openers)
- Applies `rewrites.json` overlay (paragraph-level) to canonical JSON
- Renders HTML → PDF using **PrinceXML**
- Uploads artifacts via `book-job-upload-url` (signed upload URLs)
- Finalizes job status + artifacts via `book-job-apply-result`

## Required Environment Variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `AGENT_TOKEN`

## Optional Environment Variables

- `POLL_INTERVAL_MS` (default: 3000)
- `PRINCE_PATH` (defaults to `prince` in PATH)
- `DOCRAPTOR_API_KEY` (**required** if you enqueue jobs with `render_provider=docraptor_api`)
- `DOCRAPTOR_TEST_MODE` (optional: `true|false`)

## Assets bundle (assets.zip)

If the canonical JSON contains any image `src` that is a **relative path** (not `http(s)://` and not `data:`), the worker expects the file to exist under `assets/` next to `render.html`.

Recommended convention:

- Upload `assets.zip` to storage at: `books/{bookId}/{bookVersionId}/assets.zip`
- Zip contents should include folders like:
  - `images/chapter_openers/chapter_1_opener.jpg`
  - `figures/ch1/Afbeelding_1.2.png`

The Control Plane helper Edge Function `book-version-upload-url` can issue a signed upload URL for `assets.zip`.

## Build & Run

```bash
docker build -f book-worker/Dockerfile -t ignitezero-book-worker .
docker run --rm \
  -e SUPABASE_URL="..." \
  -e SUPABASE_ANON_KEY="..." \
  -e AGENT_TOKEN="..." \
  ignitezero-book-worker
```

## PrinceXML

This worker **requires** `prince` in the container.

Because Prince licensing/install differs per environment, this repo does not ship it in the base Dockerfile.
Use a derived image (or mount a binary) and set `PRINCE_PATH` if needed.

## DocRaptor (optional)

If you enqueue render jobs with `render_provider=docraptor_api`, the worker will call DocRaptor instead of running Prince locally.

See `docs/BOOK_RENDER_PROVIDERS.md` for tradeoffs and required env vars.

## Operations / Monitoring / Retention

See `docs/BOOK_WORKER_RUNBOOK.md`.


