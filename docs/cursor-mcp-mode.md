# Cursor MCP Mode (MCP‑First Workflow)

This repository is configured to use a local MCP server as the primary control plane for inspecting and executing AI workflows during development.

## Pre-flight (always do this first)
- Inspect live state before coding:
  - `lms.listJobs` / `lms.getJob` to check recent jobs and their events
  - Re-read `system-manifest.json` (Project/Task model) so entity names stay aligned
- Never guess system state. Validate with MCP first.

## Authentication and Headers
- Base URL: `http://127.0.0.1:4000`
- Auth: `Authorization: Bearer <MCP_AUTH_TOKEN>`
- Propagate request IDs when possible: `X-Request-Id: <uuid>`

## Generic Job Contracts
- Job: `{ id, job_type, status, target_entity_id, item_ref?, payload, created_at, created_by }`
- Event: `{ job_id, ts, level, code, message, data }`
- SSE: `job-events-stream` streams normalized events for any `job_type`
- Envelope: `{ id, format, version, content }` (use format registry; never ad‑hoc)
- Apply results via a single pattern: enqueue → monitor → apply → save

## MCP Methods (development)
- Core:
  - `lms.listJobs`, `lms.getJob`
  - `lms.enqueueJob`, `lms.enqueueAndTrack`
  - Entity CRUD flows route through manifest-driven Edge functions; add new MCP proxies when a Project/Task action needs it.
- Media:
  - `lms.listMediaJobs`, `lms.getMediaJob`
  - `lms.enqueueMedia`, `lms.enqueueMediaAndTrack`
- Generic appliers and health:
  - `lms.applyJobResult` (proxies Edge Function)
  - `lms.health` (readiness of MCP + Edge)

## Frontend Rules
- Frontend calls Edge Functions only (never direct DB).
- Handle states: “course generating”, “pending jobs”, “missing assets”.
- Use `job-events-stream` (SSE) for live progress.

## Backend Rules
- All new LLM features follow: skeleton → filler → validator
- Prefer deterministic overrides; fall back to studyText synthesis as needed
- All merges must be format‑aware using the format registry

## TDD and Reporting
- Use Jest for unit/component tests; Playwright for e2e
- Maintain ≥90% coverage
- Save raw artifacts to `artifacts/` and reports to `reports/`
- Run tests after each phase; fix failures immediately

## Example Flows
1) Enqueue a job and monitor
   - `lms.enqueueJob` (or `lms.enqueueAndTrack` helper) with `{ jobType, projectId, payload }`
   - Subscribe to SSE or poll `lms.getJob` for status/events
2) Apply job results to the ProjectBoard envelope
   - `lms.applyJobResult` merges results via format-aware rules
   - Persistence happens via the dedicated Edge function for the Project/Task model (no direct `lms.saveCourse`)

## Security
- Use `AGENT_TOKEN` for Edge Function authorization
- Never expose Service Role keys in the browser


