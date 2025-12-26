## System Overview: AI Prompt Pipeline (Edge + Supabase + Workers)

This document describes **how Ignite Zero generates and ships AI-produced course content** using **Supabase Edge Functions**, **Postgres job queues**, and **Supabase Storage** (hybrid JSON storage).

If you need operational “what to do when it breaks”, see:
- `docs/JOB_QUEUE_OPERATIONS.md`
- `docs/EDGE_DEPLOYMENT_RUNBOOK.md`

---

## Goals & non-goals

### Goals
- **Durable generation**: course generation is asynchronous and retriable.
- **Hybrid storage**: course content lives as JSON in Storage; relational metadata supports search/catalog/versioning.
- **Observable**: job state is visible via DB rows + (best-effort) events/logs.
- **Preview-friendly**: works in embedded preview environments via **dev-agent auth** (no real users required).

### Non-goals
- **No mock data** in production flows (IgniteZero rule). Fail loudly when missing env/schema.
- **No “silent fallback”** values (tokens/org IDs/etc). Missing config is a hard error.

---

## Architecture at a glance

### Two execution modes

Ignite Zero uses two “pipelines” (see `docs/AI_CONTEXT.md`):

- **Live pipeline (synchronous)**: user clicks a button → Edge Function returns quickly (e.g. “generate an image for this option right now”).
- **Factory pipeline (asynchronous)**: user enqueues a job → worker processes it later (e.g. “generate an entire course”).

### Factory pipeline (course generation)

```text
Frontend (useMCP) 
  → Edge: enqueue-job
    → Postgres: ai_course_jobs (pending)
      → Worker (cron/manual):
          - ai-job-batch-runner OR process-pending-jobs OR ai-job-runner?worker=1
            → Edge: generate-course?jobId=...
              → Storage: courses/<courseId>/course.json
              → Postgres: course_metadata (upsert), catalog_updates (best-effort)
              → (optional) Postgres: ai_media_jobs (study text images)
```

### Factory pipeline (media generation)

```text
Frontend or generate-course
  → Postgres: ai_media_jobs (pending)
    → Worker: media-runner
      → AI provider (OpenAI/…)
      → Storage: media-library/...
      → Storage: courses/<courseId>/course.json (attach URLs)
```

---

## Key components (with source locations)

### Frontend
- **API wrapper & dev-agent auth**: `src/lib/api/common.ts` (`callEdgeFunction*`, `isDevAgentMode()`)
- **MCP-style client wrapper**: `src/hooks/useMCP.ts`
- **AI Course Generator UI**: `src/pages/admin/AIPipelineV2.tsx`
- **Course Editor**: `src/pages/admin/CourseEditorV2.tsx`
- **Route guard (preview bypass)**: `src/components/auth/ProtectedRoute.tsx`

### Edge Functions (Supabase)
- **Job enqueue**: `supabase/functions/enqueue-job/index.ts`
- **Course generation**: `supabase/functions/generate-course/index.ts`
  - orchestration: `supabase/functions/generate-course/orchestrator.ts`
  - skeleton/filler/helpers: `supabase/functions/_shared/*`
- **Workers**:
  - `supabase/functions/ai-job-batch-runner/index.ts` (batch “worker”)
  - `supabase/functions/process-pending-jobs/index.ts` (simple worker, good for manual runs)
  - `supabase/functions/ai-job-runner/index.ts` (supports `?worker=1` mode)
- **Reconciler**: `supabase/functions/jobs-reconciler/index.ts`
- **Media worker**: `supabase/functions/media-runner/index.ts`
- **Publish/versioning**: `supabase/functions/publish-course/index.ts`

### Database + Storage (Supabase)
- **Job tables**:
  - `public.ai_course_jobs`
  - `public.ai_media_jobs`
- **Course metadata/versioning**:
  - `public.course_metadata` (relational index for catalog)
  - `public.course_versions` (publish snapshots)
- **Storage buckets** (canonical):
  - `courses` (course JSON + debug artifacts + version snapshots)
  - `media-library` (generated media assets)

---

## Authentication model (hybrid)

Ignite Zero supports two auth modes on Edge:

### 1) User session auth (live users)
- Requests include `Authorization: Bearer <JWT>`.
- Edge Functions validate via `supabase.auth.getUser()` (anon-key client) and then authorize using `user_roles`/org membership.

### 2) Dev-agent auth (preview / automation)
Designed for iframe/preview environments where sessions are unreliable and **there may be no real users at all**.

Frontend sends:
- `x-agent-token`
- `x-organization-id`
- `x-user-id` (may be a synthetic UUID for audit correlation; must not require `auth.users`)

Edge Functions:
- Verify agent token against the `AGENT_TOKEN` secret.
- Enforce **organization boundary** explicitly (since service-role bypasses RLS).
- Avoid writing synthetic IDs into columns that FK into `auth.users`.

---

## Data model (important fields)

### `ai_course_jobs`
Represents an async “generate course” job.

Common fields:
- `status`: `pending | processing | done | failed | dead_letter | stale`
- `retry_count`, `max_retries`
- `started_at`, `completed_at`
- `last_heartbeat` (worker liveness signal)
- `progress_stage`, `progress_percent`, `progress_message` (UI-friendly progress)
- `result_path` (usually `<courseId>/course.json`)

Worker RPC helpers (see migrations):
- `get_next_pending_job()` (select + lock with `FOR UPDATE SKIP LOCKED`)
- `update_job_heartbeat(job_id, job_table)`
- `mark_stale_jobs()`
- `move_to_dead_letter()`
- `requeue_job(jobId, tableName)`

### `ai_media_jobs`
Represents async media generation (image/audio/video). Similar lifecycle fields to `ai_course_jobs`.

---

## Course generation pipeline (end-to-end)

### Step 0: UI submits a request
The UI calls `enqueue-job` with:
- `jobType: "ai_course_generate"`
- `payload`: `course_id`, `subject`, `grade_band`, `items_per_group`, `mode`, optional `notes`

Implementation:
- `supabase/functions/enqueue-job/index.ts`

Key behaviors:
- **Idempotency**: optional `Idempotency-Key` header can produce a deterministic job id.
- **Special requests**: `notes` are persisted to Storage (so workers can read them later):
  - `courses/debug/jobs/<jobId>/special_requests.json`

### Step 1: Job enters the queue
Row inserted into `ai_course_jobs` with `status='pending'`.

### Step 2: Worker picks the job
There are multiple worker entrypoints (all converge on `generate-course`):
- `ai-job-batch-runner` (batch runner; typically scheduled)
- `process-pending-jobs` (simple worker; good for manual runs/testing)
- `ai-job-runner?worker=1` (Dawn-style worker: RPC pick + heartbeat)

All of them:
- mark the job `processing`
- call `generate-course?jobId=<id>` with service-role authorization

### Step 3: `generate-course` builds the course
Implementation: `supabase/functions/generate-course/index.ts` + `orchestrator.ts`.

High-level stages:
- **Select strategy** (deterministic pack vs skeleton+LLM)
- **Build skeleton** (structural scaffolding)
- **Fill** with LLM (prompts assembled from subject/grade/mode/notes)
- **Validate & normalize** (Zod + item normalization)
- **Repair** (bounded retries for known failure classes)

### Step 4: Persist artifacts (hybrid storage)
Canonical write:
- Storage: `courses/<courseId>/course.json`
Relational indexing:
- `course_metadata` upsert (org + visibility + tags + content_version)
- `catalog_updates` insert (best-effort)

### Step 5 (optional): enqueue study-text images
If notes/request implies images for study texts, `generate-course` can enqueue `ai_media_jobs` with `targetRef.type="study_text"`.

---

## Media pipeline (images/audio/video)

### Synchronous (live) media generation
Used when the UI needs an immediate image:
- Edge: `ai-generate-media`

This is typically used by the Course Editor for “generate image now” actions.

### Asynchronous (factory) media generation
Used when generating many images reliably:
- enqueue `ai_media_jobs`
- worker: `media-runner`

`media-runner` responsibilities:
- pick next pending job (RPC `get_next_pending_media_job()` when available)
- call provider (OpenAI/…)
- upload bytes to `media-library`
- attach resulting public URL into `courses/<courseId>/course.json`
  - item image: set `stimulus` (or other course media slots)
  - study text image: replace `[IMAGE:...]` markers
- mark job done/failed; do a **final sync pass** for study-text images to avoid race overwrites

Implementation:
- `supabase/functions/media-runner/index.ts`

---

## Heartbeat, retries, dead-letter, and reconciliation

### Heartbeat
Workers should periodically update `last_heartbeat` (RPC: `update_job_heartbeat`).

### Stale detection
DB helper `mark_stale_jobs()` can mark `processing` jobs stale when:
- `last_heartbeat < now() - 5 minutes`

### Dead-letter
After `retry_count >= max_retries`, helpers can move jobs to `dead_letter`.

### Reconciler (drift correction)
`jobs-reconciler` is a “self-heal” loop:
- If course JSON exists in Storage but the job row isn’t `done`, mark it `done`.
- If a job is stuck (no heartbeat too long), mark it `failed` (or stale depending on policy).

Implementation:
- `supabase/functions/jobs-reconciler/index.ts`

---

## Observability & debugging

### Primary data sources
- `ai_course_jobs` / `ai_media_jobs` rows (source of truth for state)
- Edge logs in Supabase Dashboard (function logs)

### Best-effort event stream
Some workers emit “job events” (progress breadcrumbs). These are treated as **best-effort** (pipeline correctness must not depend on them).

---

## Deployment & verification

### Deploy functions
Follow: `docs/EDGE_DEPLOYMENT_RUNBOOK.md`

Repo helper:
- `scripts/ci/deploy-functions.ps1 -EnvPath supabase/.deploy.env`

### Verify live deployment
- `npx tsx scripts/verify-live-deployment.ts`

### High-signal live E2E tests (real DB + real providers)
- `npm run e2e:live:studytext-images`
- `npm run e2e:live:option-image-fit`
- `npm run e2e:live:publish-agent`
- `npm run e2e:live:lifecycle-agent`

---

## Related docs
- `docs/JOB_QUEUE_OPERATIONS.md` (runbook: cron schedules, SQL snippets, recovery)
- `docs/EDGE_DEPLOYMENT_RUNBOOK.md` (how to deploy safely)
- `docs/AI_PROVIDERS.md` (provider configuration)
- `docs/SECRETS_AND_TOKENS.md` (env/secrets)


