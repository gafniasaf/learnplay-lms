## Legacy Parity (Real DB) – Gap Report

### How to run

```bash
npm run e2e:real-db -- tests/e2e/legacy-parity --project=authenticated --workers=1
```

### Running E2E in small batches (recommended when Playwright hangs)

If the full run hangs or is too slow to iterate, run the same suite in **small sequential batches**:

```bash
# Run legacy-parity in batches of 4 specs, one worker
npm run e2e:batch -- --dir tests/e2e/legacy-parity --batchSize 4 --workers 1
```

Resume after a crash/hang without re-running already completed batches:

```bash
npm run e2e:batch -- --dir tests/e2e/legacy-parity --batchSize 4 --workers 1 --resume
```

Run a single batch (0-based index):

```bash
npm run e2e:batch -- --dir tests/e2e/legacy-parity --batchSize 4 --only 2
```

If Playwright hangs, add a hard timeout per batch and continue running the rest:

```bash
# Kill any batch that runs longer than 12 minutes, keep going, and report failed batches at the end.
npm run e2e:batch -- --dir tests/e2e/legacy-parity --batchSize 4 --workers 1 --timeoutMs 720000 --continueOnFail
```

Real DB config in batches:

```bash
npm run e2e:real-db:batch -- --dir tests/e2e/legacy-parity --batchSize 2 --workers 1 --resume
```

**Recommended (most reliable):** run legacy-parity against the real DB with setup/auth state generation and per-spec isolation:

```bash
npm run e2e:legacy-parity:real-db:batch
```

### Required env (resolved automatically from local env files when present)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` (required for auto-provisioning E2E users)
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`
- `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD`
- `E2E_TEACHER_EMAIL`, `E2E_TEACHER_PASSWORD`
- `E2E_PARENT_EMAIL`, `E2E_PARENT_PASSWORD`

### Current status (2025-12-15)

- **21 passing / 1 skipped**

### Coverage (legacy parity journeys)

- **Portals**: `tests/e2e/legacy-parity/portals.parity.spec.ts`
- **Dashboard route aliases (legacy URLs redirect)**: `tests/e2e/legacy-parity/dashboard-routes.parity.spec.ts`
- **Admin AI pipeline (V2)**: `tests/e2e/legacy-parity/admin-ai-pipeline.parity.spec.ts`
- **Admin course editor load**: `tests/e2e/legacy-parity/admin-course-editor.parity.spec.ts`
- **Admin variants audit + approve**: `tests/e2e/legacy-parity/admin-editor-diff-approve.parity.spec.ts`
- **Admin tag management**: `tests/e2e/legacy-parity/admin-tag-management.parity.spec.ts`
- **Student assignments**: `tests/e2e/legacy-parity/student-assignments.parity.spec.ts`
- **Student play loop**: `tests/e2e/legacy-parity/student-play-flow.parity.spec.ts`
- **Parent dashboard**: `tests/e2e/legacy-parity/parent-portal.parity.spec.ts`
- **MCP metrics proxy (browser CORS)**: `tests/e2e/legacy-parity/mcp-proxy.parity.spec.ts`
- **Agent API smoke**: `tests/e2e/legacy-parity/agent-api.parity.spec.ts`

### Skipped journey (opt-in because it mutates Real DB)

#### Admin publish flow

- **Spec**: `tests/e2e/legacy-parity/admin-publish.parity.spec.ts`
- **How to enable**:
  - `E2E_ALLOW_PUBLISH_MUTATION=1`
  - `E2E_PUBLISH_COURSE_ID=<a throwaway course id>`

### Notes

- Some parity journeys require existing `storageState` files (e.g. `playwright/.auth/student.json`). If those are missing/expired, re-run the corresponding setup in `tests/e2e/*.setup.ts`.

---

## Dashboard parity (Legacy DAWR React vs Current)

### Sources of truth

- **Legacy DAWR React system**: `dawn-react-starter/src/pages/**` (dashboards + role portals)
- **Current system**: `src/pages/**` and `src/routes.generated.tsx`
- **Generated legacy route map**: `generated/routes.json` (used by parity tests and route scaffolding)

### Route parity summary (dashboards & closely-related pages)

This is a **route diff** between `generated/routes.json` (legacy map) and the current route table (`src/routes.generated.tsx` + `src/App.tsx` redirects).

#### Renames / moved routes (not true feature gaps)

- **Admin**
  - `/admin/courses` → `/admin/courses/select` (+ editor at `/admin/editor/:courseId`) (**legacy alias route added** in `src/App.tsx`)
  - `/admin/course-versions` → `/admin/courses/:courseId/versions` (**legacy alias route added**; renders course selector when no course id is provided)
  - `/admin/media-manager` → `/admin/tools/media` (**legacy alias route added**)
  - `/admin/tag-approval` → `/admin/tags/approve` (**legacy alias route added**)
  - `/admin/metrics` → `/admin/metrics` (**now routed** in `src/App.tsx` to `src/pages/admin/Metrics.tsx`)
- **Teacher**
  - `/teacher/assignment-progress` → `/teacher/assignments/:id/progress` (**legacy alias route added**; renders assignments list)
- **Play**
  - `/play/welcome` → `/play/:courseId/welcome` (**legacy alias route added**; `/play/welcome` renders the play entry page)
- **Messages**
  - `/messages/inbox` → `/messages` (**legacy alias route added**)

#### Potential gaps (routes exist in code but are not currently reachable from the legacy map)

- **Admin dashboard home**:
  - Legacy map has `/admin` as “Admin Dashboard”
  - Current app redirects `/admin` → `/admin/ai-pipeline` and keeps the “Admin Portal” page at `/admin/console`
- **Docs**
  - Legacy map includes `/docs/integration-guide`
  - Current app does not expose that route (integration guide exists in docs, but not as a routed page)

### Functional parity gaps by dashboard (legacy behavior vs current)

#### Student dashboard (`/student/dashboard`)

- **Legacy (DAWR)**: rich “My Learning” dashboard includes:
  - KPI sparklines + WoW deltas (minutes/items), streak, accuracy badge
  - Weekly goal ring (minutes + items), next-up assignment, continue point
  - Recent sessions, achievements glance, recommendations
  - Knowledge-map cards (skills focus) and assignments widget (mock-backed in legacy)
- **Current**:
  - Uses live `useDashboard("student")` and intentionally **does not** fall back to mock selectors.
  - The dashboard UI now only renders **live fields that exist today** (courses in progress/completed, accuracy, streak, upcoming, recent) and shows a non-blocking “coming soon” note for legacy widgets.
- **Still missing for full legacy parity (intentionally skipped in the easy plan)**:
  - minutes/items time series + deltas
  - weekly goals (minutes/items)
  - recent sessions feed
  - continue point + skill map summary
  - achievement feed expansion (beyond simple list support)

#### Parent dashboard (`/parent/dashboard` + drill-down pages)

- **Legacy (DAWR)**:
  - Parent dashboard + drill-down pages rely on a mix of live hooks and mock fallback in some areas.
  - Multi-card overview: summary KPIs, subjects, topics, timeline, goals.
- **Current**:
  - Uses live hooks: `useParentDashboard`, `useParentSubjects`, `useParentTimeline`, `useParentGoals`, `useParentTopics`.
  - Includes “seeded demo parent” support in dev-agent mode to make preview/testing possible without linked children.
- **Gaps / risks**:
  - **Data completeness** is highly dependent on `parentDashboard.children[0].studentId` being present; without it, downstream cards are empty.
  - Teacher presence / “parent assignments” remain blocked/placeholder (see TODOs in the parent dashboard implementation).

#### Teacher dashboard (`/teacher/dashboard` + drill-down pages)

- **Legacy (DAWR)**:
  - Teacher dashboard used mock mode toggles and hardcoded teacher identifiers in some widgets.
  - Assignment generation called edge endpoints directly.
- **Current**:
  - Uses real hooks and MCP calls (e.g. `lms.generateAssignment`, `lms.generateRemediation`).
  - Assignment progress is now explicitly labeled **“coming soon”** (no misleading `0%` progress bars).
- **Gaps**:
  - Replace remaining placeholder progress calculations with real progress aggregation from session/attempt data.
  - Confirm “class focus / knowledge map” widget is fully live for real classes (not dev-only).

#### Admin dashboard & admin tools

- **Legacy (DAWR)**:
  - “Admin Dashboard” home and tools: AI pipeline, courses, job queue, media manager, logs, system health, performance monitoring, tags, metrics.
- **Current**:
  - Primary entry is `/admin/ai-pipeline` (and `/admin/console` exists but is effectively legacy/partially outdated).
  - Many admin tools are present and covered by E2E parity tests (pipeline, editor load, variants audit/approve, tags).
- **Gaps**:
  - **Admin home route mismatch**: legacy expects `/admin` to be a dashboard; current treats `/admin` as a redirect.
  - **Performance page**: flagged as demo/fake in `docs/ADMIN_PAGES_ANALYSIS.md` and should be either real or clearly labeled.

#### School dashboard (`/schools`)

- **Legacy (DAWR)** and **Current** both render a “School Portal” but:
  - Live mode currently shows **basic stats only** and explicitly says “Full school features coming soon.”
  - The “Quick Access” buttons now have explicit “not implemented yet” click behavior (toasts) in mock mode (no dead buttons).

