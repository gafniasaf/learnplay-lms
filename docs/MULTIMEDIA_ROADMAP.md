## Multimedia Exercises Rollout Roadmap

This roadmap adds exercise-based multimedia while preserving the existing selection algorithm (groups, levels, clusterId, variant) and the single-result scoring contract (options/numeric or boolean correctness). Each step follows strict TDD: component test first, then implementation, unit tests, then E2E.

### Step 1 — Visual MCQ (image stem/options)
- Scope: `stimulus: { type: "image", url, alt }` rendered in MCQ.
- Acceptance: Image renders with alt text; answer flow unchanged.
- Tests: Component test (fail first), unit tests for schema/fallbacks, E2E flow.

### Step 2 — AI Image Generation Pipeline
- Table: `public.ai_media_jobs` (pending→processing→done/failed) + RPC `get_next_pending_media_job()`.
- Runner: `ai-media-runner` edge function; adapter for OpenAI Images first.
- Storage: `courses/<courseId>/assets/images/<uuid>.webp`; attach to item `stimulus`.
- Tests: State machine unit tests, adapter mocks, E2E (live-gated via `E2E_LIVE=1`).

### Step 3 — Audio-prompt MCQ
- Scope: `stimulus: { type: "audio", url, transcriptUrl? }` with standard MCQ.
- Tests: Component test, unit for transcript/preload, E2E play + answer.

### Step 4 — TTS Generation (OpenAI + ElevenLabs fallback)
- Extend `ai_media_jobs` for `mediaType="audio"`; adapters, rate limits, moderation.
- Storage: `.mp3` + optional `.vtt`; attach to item.
- Tests: Adapter selection, retries, quotas, E2E gated.

### Step 5 — Video-prompt → MCQ/Numeric
- Scope: `stimulus: { type: "video", url, captionsUrl }` with short clips (3–6s).
- Optional provider via Replicate-compatible adapters (Runway/Luma/Pika).
- Tests: Component first, caption loading unit tests, E2E one-item flow.

### Step 6 — Drag-and-drop Classification
- Scope: `interaction: { type: "dragDrop", bins, tiles }`; evaluation is boolean all-correct.
- Tests: Accessible keyboard path component test, unit for evaluation, E2E.

### Step 7 — Diagram Labeling (hotspots)
- Background image + hotspots; evaluate by correct target id.
- Tests: Hit testing, responsive scaling, E2E labeling.

### Step 8 — Timed Fluency Wrapper
- Wrapper timer around existing items; logs session stats separately.
- Tests: Timer component test, unit for stats, E2E 30s sprint.

### Step 9 — Chart/Graph Interpretation
- Scope: `stimulus: { type: "chart", url|config }` rendered SVG/canvas; answer via MCQ/numeric.
- Tests: Render + answer component test, data parsing unit, E2E.

---

## Data and API Additions (backwards-compatible)

- Item extension:
  - `stimulus?: { type: "image"|"audio"|"video"|"diagram"|"chart"; url: string; alt?: string; captionsUrl?: string; transcriptUrl?: string; attribution?: string; generatedBy?: { provider: string; model: string; date: string } }`
  - `interaction?: { type: "mcq"|"numeric"|"dragDrop"|"label"|"match"|"order"; config?: Record<string, unknown> }`
  - `evaluation?: { strategy: "single"|"allPairs"|"orderExact"|"setExact" }`

- Jobs: `public.ai_media_jobs`
  - Fields: id, course_id, item_id, media_type, prompt, provider, provider_job_id, status, result_path, error, progress_stage, progress_percent, progress_message, created_by, created_at, started_at, completed_at
  - RPC: `get_next_pending_media_job()`

- Edge function: `ai-media-runner` (server-to-server only)
  - Picks next job, calls provider adapter, writes to Storage, updates item, reports progress.

## Providers and Env Vars

- OpenAI Images + TTS: `OPENAI_API_KEY`
- ElevenLabs (TTS fallback): `ELEVENLABS_API_KEY`
- Replicate (video/image adapters): `REPLICATE_API_TOKEN`
- Config: `MEDIA_PROVIDER_ALLOWLIST`, per-model names; quotas per user/day.

## Testing & Reporting (each step)

- Build: `npm ci && npm run build`
- Unit: `npm test` → `reports/coverage/`
- E2E: `npm run e2e` → `reports/playwright-html/`
- Diagnostics: JSON to `reports/diagnostics/`; extra logs to `artifacts/`

## Accessibility

- Images require `alt`; audio/video require captions/transcripts; keyboard paths for DnD/labeling; focus management; ARIA roles.

## Safety, Cost, Moderation

- Prompt and output moderation; provider rate limits; per-user quotas; prompt hashing for dedupe; stored `generatedBy` attribution.


