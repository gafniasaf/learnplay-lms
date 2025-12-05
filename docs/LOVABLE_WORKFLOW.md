# Lovable Operations & Collaboration Guide

This guide defines how we work with Lovable, what we handle locally vs. in Lovable, how tests run, and how deployments are triggered via GitHub. It also includes prompt templates and a rule that every Lovable action must self-document changes in-repo.

## Ownership and Boundaries

- What we handle here (local, in-repo):
  - Code edits across `src/`, `supabase/functions/`, `supabase/migrations/`, and docs.
  - Tests: Jest (unit/integration) and Playwright (E2E/diagnostics).
  - Build/preview, coverage and test reports, diagnostics reports.
  - Commit and push to `main` to trigger Lovable sync/deploy.
- What Lovable handles via prompts/UI:
  - Cloud environment configuration and secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, service role, CORS origin lists).
  - Supabase Edge Function deployment/logs visibility in Lovable Cloud.
  - Any actions requiring Lovable’s UI (project settings, preview envs).

Rule of thumb: Do everything that can be automated by code and CI here; use Lovable only for cloud settings, secrets, or UI actions we cannot perform programmatically.

## Testing Strategy

### Unit/Integration (Jest)
- Framework: Jest + `@swc/jest` with `jsdom`.
- Commands:
  - `npm test`
  - `npm run test:watch`
  - `npm run test:coverage` (reports in `reports/coverage/`, JUnit in `reports/junit.xml`)
- Config: `jest.config.ts` (module mapping, transforms, coverage thresholds, reporters).

### End-to-End (Playwright)
- Commands:
  - `npm run e2e`
  - `npm run e2e:headed`
  - `npm run e2e:report`
- Preview: `npm run build` → `npm run preview -- --strictPort` (http://localhost:8080).
- Modes:
  - Mock mode with `?live=0` (persisted via localStorage). Prefer for deterministic E2E.
  - Live mode with `?live=1` (requires valid Supabase env/cors).

### Diagnostics Flow (Playwright → JSON → GitHub)
- Purpose: capture console/network failures and CORS headers for Supabase `auth`/`functions` and persist as JSON in-repo.
- Files:
  - `tests/e2e/diagnostics.spec.ts` — visits key routes (mock + live), collects console/network and CORS headers.
  - `scripts/post-diagnostics-push.cjs` — commits timestamped JSON report and pushes to `main`.
- Command: `npm run diag` → writes `reports/diagnostics/diagnostics-<timestamp>.json` and auto-pushes.

## Deployment via GitHub

- Source of truth branch: `main`.
- Lovable tracks `main` for 2‑way sync and auto-deploy (including Edge Functions).
- Flow:
  1. Work locally, run tests.
  2. Commit and push to `main`.
  3. Lovable syncs and deploys (allow brief delay).
- Notes: avoid force pushes; commit reports under `reports/` as needed (JUnit, coverage, diagnostics).

## Lovable Cloud Usage

- Backend: Supabase (DB, Auth, Storage, Edge Functions).
- Env/secrets: managed in Lovable; never commit secrets.
- CORS: centralized wrappers in `supabase/functions/_shared/` ensure consistent headers; troubleshoot via diagnostics report if needed.

## Always Handle From Here

- Code, tests, configs, docs; builds and reports; diagnostics and investigative tests that persist artifacts to the repo.

## Use Lovable For

- Secrets and cloud configuration, origin whitelists, preview constraints, project provisioning, and Edge Function logs you can’t access locally.

## Prompting Lovable (Template)

```
# Context
What’s the goal / problem? Current behavior? Relevant files/architecture.

## Task
Exact change or artifact to create.

### Guidelines
- Do not expose secrets; never print tokens
- Keep diffs minimal; update only necessary files
- Prefer adding artifacts under reports/ and docs/

#### Constraints
- Frontend: React + Vite
- Tests: Jest, Playwright
- Output locations: reports/, docs/

## Acceptance Criteria
- Concrete, testable outcomes (paths, commands succeed, headers present)

## Implementation Notes
- Filenames/paths to create/edit
- Commands to run

## Action README (REQUIRED)
Create `reports/lovable-actions/<timestamp>-<slug>.md` summarizing:
- What changed and why
- Files modified/added
- Commands to run / validation steps
- Rollback steps
Commit and push this README with your changes.
```

### Getting Runtime Data From Lovable
Ask Lovable to run a Playwright diagnostics test that writes structured artifacts (JSON/MD) to the repo and auto-commits/pushes them (e.g., `reports/diagnostics/` or `reports/lovable-actions/`). Review the artifacts here.

## Quick Commands

- Build/Preview: `npm run build` → `npm run preview -- --strictPort`
- Unit tests: `npm test`; coverage: `npm run test:coverage`
- E2E tests: `npm run e2e`; report: `npm run e2e:report`
- Diagnostics: `npm run diag`

---

Follow this guide to keep workflows deterministic, auditable, and automated across local and Lovable environments.


