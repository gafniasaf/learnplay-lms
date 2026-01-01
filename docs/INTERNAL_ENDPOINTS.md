# Internal/Extended Endpoints Index

This is a high-signal index of additional Edge Functions present in `supabase/functions/`. These are primarily internal or admin-facing. Unless noted otherwise, all endpoints are under `/functions/v1/<name>` and require Authorization: Bearer <token>.

- Classes & Assignments
  - create-class (POST) — Create a class
  - list-classes (GET) — List classes
  - add-class-member (POST), remove-class-member (POST) — Manage class roster
  - generate-class-code (POST) — Generate a join code
  - join-class (POST) — Student joins class via code
  - create-assignment (POST) — Create an assignment
  - list-assignments (GET), list-assignments-student (GET) — List assignments
  - get-assignment-progress (GET) — Aggregate progress
  - assign-assignees (POST), check-assignment-completion (POST) — Manage/validate assignees
  - update-auto-assign-settings (POST), get-auto-assign-settings (GET) — Auto-assign config

- Messaging
  - send-message (POST) — Send an in-app message
  - list-messages (GET), list-conversations (GET) — Inbox/conversations

- Catalog / Content
  - list-courses (GET) — Paginated catalog (global + org). Supports `?format=` filter via `course_metadata.tags.__format` (e.g. `format=practice` for playable catalogs, `format=mes` for imported library browsing).
  - list-courses-filtered (GET) — Tag/org/visibility filters
  - get-course (GET), publish-course (POST), restore-course-version (POST)
  - search-courses (GET) — Metadata search (id/title/subject). Supports `?format=` filter (same as list-courses).
  - update-course (POST), apply-course-patch (POST), fix-catalog-entry (POST)
  - update-catalog (POST), debug-catalog (GET), debug-storage (GET)

- Discovery/Search
  - search-content (GET) — Semantic content search
  - search-media (GET) — Media search
  - get-recommended-courses (GET) — Recommendations

- AI Generation Pipeline (Admin/System)
  - author-course (POST), review-course (POST)
  - ai-generate-exercises (POST), ai-generate-media (POST)
  - ai-job-runner (System), ai-job-batch-runner (System), ai-media-runner (System)
  - job-status (GET), jobs-reconciler (POST)
  - enrich-study-text (POST), regenerate-embeddings (POST)
  - test-anthropic (GET) — Provider diagnostics

- Student Experience
  - play-session (GET/POST/PATCH) — Start/resume/save play sessions
  - results-detail (GET) — Round details; supports share token (public access)
  - student-dashboard (GET), student-timeline (GET)
  - student-achievements (GET) — Achievements summary
  - student-goals (GET/PATCH) — Goals list and updates

- Parent & Teacher Dashboards
  - parent-dashboard (GET) — Overview for linked children
  - parent-children (GET/DELETE) — Link management
  - parent-subjects (GET), parent-topics (GET), parent-goals (GET) — Insights
  - parent-timeline (GET) — Activity timeline
  - get-class-progress (GET), get-class-ko-summary (GET) — Class analytics
  - list-students-for-course (GET), list-org-students (GET)

- Analytics/Exports
  - get-analytics (GET), export-analytics (GET)
  - export-gradebook (GET)
  - get-domain-growth (GET)

Notes
- Many admin/system endpoints run with service-role privileges and are not intended for public clients.
- CORS behavior is standardized via `_shared/cors.ts` on newer endpoints; legacy functions may still use permissive headers.
- For detailed shapes and constraints, see the specific docs in `docs/` or the function source under `supabase/functions/`.
