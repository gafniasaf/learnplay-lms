# Teacherbuddy → LearnPlay Port Status (High‑Signal)

This repo contains an extracted Teacherbuddy codebase at `external/material-mindmap-forge-main/`. The goal is to port **existing functionality** into LearnPlay without breaking core learner Play flows.

This document exists so **new AI agents** can understand what has already been implemented and where to continue.

---

## What’s been implemented in LearnPlay

### Phase 3 — 13k Course Replication (Teacherbuddy → LearnPlay)

- **Script**: `scripts/replicate-teacherbuddy-courses.ts`
- **Target**: LearnPlay `save-course` Edge Function
- **Key rule**: Imported content must be tagged with a non-playable `format` (e.g. `mes` / `library`) and must be isolated from learner Play flows.

### Phase 4 — Library Courses UI + Format Isolation

**Problem solved**: imported library courses should not appear in the normal playable “Courses” catalog (or break Play).

- **Edge**:
  - `supabase/functions/list-courses` supports `?format=` (filters on `course_metadata.tags.__format`)
  - `supabase/functions/search-courses` supports `?format=` (same)
- **Frontend**:
  - `src/hooks/useMCP.ts` `getCourseCatalog()` now requests `format=practice`
  - Admin browsing pages:
    - `src/pages/admin/LibraryCourses.tsx` (`/admin/library-courses`)
    - `src/pages/admin/LibraryCourseDetail.tsx` (`/admin/library-courses/:courseId`)
- **MCP**:
  - `lms-mcp/src/index.ts` exposes:
    - `lms.listLibraryCourses`
    - `lms.searchLibraryCourses`
    - `lms.getLibraryCourseContent`

### Phase 5 — Lesson Kit Pipeline (Shared Module Port)

**Ported code**: Teacherbuddy’s 3‑pass lesson kit pipeline is now available as a shared module in LearnPlay:

- **Location**: `supabase/functions/_shared/lesson-kit/*`
- **Passes**:
  - Pass 1: extract ground truth (no LLM)
  - Pass 2: constrained transform (LLM) via `supabase/functions/_shared/ai.ts`
  - Pass 3: validate + (optional) repair
- **Policy**: No silent fallbacks on LLM failure. Missing provider must fail with a clear `BLOCKED` error.

**Not yet wired** (to be completed during Phase 5):
- A manual `ai-job-runner` strategy at `supabase/functions/ai-job-runner/strategies/lessonkit_build.ts` to call the shared pipeline and persist outputs as `lesson-kit` records.
- A teacher/admin UI to enqueue/run the job and view outputs.

---

## Operational Notes / Guardrails

- **Format isolation is mandatory**: playable flows assume `format=practice`. Imported formats must be browsed via dedicated “Library” UIs.
- **No-fallback policy**: if an LLM provider is missing, the job must fail loudly with an explicit `BLOCKED` error (do not return placeholder kits).
- **Generated vs manual code**:
  - Do **not** hand-edit `supabase/functions/ai-job-runner/registry.ts` (it’s generated).
  - To override generated job stubs, add a manual strategy file at `supabase/functions/ai-job-runner/strategies/<jobId>.ts`.



