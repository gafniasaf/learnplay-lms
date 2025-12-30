# Book Worker Runbook (Execution Plane)

This runbook covers **operations**, **monitoring**, and **retention** for the book rendering worker (`book-worker/worker.mjs`).

## What the worker does

- **Claims jobs** from `book_render_jobs` via the Edge Function `book-claim-job` (agent-token only)
- **Heartbeats** while processing via `book-job-heartbeat` (every ~25s)
- **Downloads inputs** via `book-version-input-urls` (canonical + optional overlay)
- **Downloads inputs** via `book-version-input-urls`:
  - canonical JSON (required)
  - rewrites overlay (optional)
  - figures mapping (optional)
  - design tokens (optional)
  - assets bundle `assets.zip` (optional, but REQUIRED if the canonical references local images / chapter openers)
- **Renders** PDF using:
  - `prince_local` (PrinceXML inside the container), or
  - `docraptor_api` (optional managed Prince)
- **Uploads artifacts** via signed PUT URLs from `book-job-upload-url`
- **Finalizes** job status + artifacts via `book-job-apply-result`

## Required configuration

- **Env vars (required)**:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `AGENT_TOKEN`
- **Env vars (optional)**:
  - `POLL_INTERVAL_MS` (default 3000)
  - `PRINCE_PATH` (defaults to `prince` in PATH)
  - `DOCRAPTOR_API_KEY` (required only when render provider is `docraptor_api`)
  - `DOCRAPTOR_TEST_MODE` (`true|false`)
  - `OPENAI_API_KEY` (required only for BookGen Pro pipeline jobs)
  - `ANTHROPIC_API_KEY` (optional; if set, BookGen Pro can use Anthropic for rewrites)

The worker **does not** need a global `ORGANIZATION_ID` env var: it reads `organization_id` from the claimed job row and forwards it as `x-organization-id` to functions that require org scoping.

## Assets bundle (assets.zip)

If the canonical JSON contains any `<img src="...">` that is a **relative path**, the worker will **fail the job** unless the referenced files exist on disk.

Recommended approach:

- Upload an `assets.zip` to: `books/{book_id}/{book_version_id}/assets.zip`
- Zip root must contain folders like `images/` and `figures/` (do not nest under an extra `assets/` folder)
- The worker downloads + extracts it to `workDir/assets/` and renders with `assetsBaseUrl="assets"`

Use the Edge Function `book-version-upload-url` to obtain a signed upload URL for `assets.zip`.

## Deploy / run (Docker)

- **Build**:

```bash
docker build -f book-worker/Dockerfile -t ignitezero-book-worker .
```

- **Run** (example):

```bash
docker run -d --restart=always --name ignitezero-book-worker \
  -e SUPABASE_URL="..." \
  -e SUPABASE_ANON_KEY="..." \
  -e AGENT_TOKEN="..." \
  ignitezero-book-worker
```

## Monitoring checklist

- **Job table**: `public.book_render_jobs`
  - Watch: `status`, `retry_count`, `max_retries`, `error`, `last_heartbeat`, `progress_stage`, `progress_percent`
- **Stuck processing detection**:
  - Stale threshold is currently **5 minutes** (see `public.mark_stale_jobs()`).
  - Worker heartbeat interval is **25s**.
- **Artifacts table**: `public.book_artifacts`
  - New artifacts should appear for completed jobs.
- **Storage**: `books` bucket
  - Artifact path convention:
    - `{book_id}/{book_version_id}/runs/{run_id}/jobs/{job_id}/{fileName}`

## Recovery procedures

### Worker not running / no jobs completing

- Verify the container is running and logs are updating.
- Confirm `AGENT_TOKEN` matches the deployed Edge secret.

### Jobs stuck in `processing` (heartbeat stopped)

Use the DB helper to mark stale jobs:

```sql
select * from public.mark_stale_jobs();
```

Then requeue a specific book job (sets status back to `pending`, resets retry/error fields):

```sql
select public.requeue_book_render_job('<job_uuid>'::uuid);
```

### Jobs repeatedly failing

Move exhausted retries to dead-letter:

```sql
select * from public.move_to_dead_letter();
```

Then inspect `book_render_jobs.error`, plus the uploaded logs:
- `prince.log` (for `prince_local`)
- `docraptor.log` (for `docraptor_api`)

## Retention guidance (runs + artifacts)

There is **no automatic retention GC** in the control plane yet.

- **Recommended policy (baseline)**:
  - Keep the most recent **N runs per book version** (e.g., N=10) and/or keep artifacts for **X days** (e.g., 30 days).
  - Keep at least one “golden” run per version (manual pinning approach).
- **What to delete** (old runs):
  - Rows in `book_artifacts` (metadata)
  - Objects in the `books` bucket under:
    - `{book_id}/{book_version_id}/runs/{run_id}/...`
  - Optionally rows in `book_render_jobs` and `book_run_chapters` after artifacts are removed.

If you implement automated retention later, keep it **explicit** and **observable** (no silent deletion): log deleted run IDs and object counts.

## Local Prince (non-Docker) quickstart (recommended for now)

If you have Prince installed on your machine and want the fastest local setup:

- Set env:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `AGENT_TOKEN`
  - `PRINCE_PATH` (full path to the Prince executable; required to avoid PATH ambiguity)
- Run:
  - `node book-worker/worker.mjs`


