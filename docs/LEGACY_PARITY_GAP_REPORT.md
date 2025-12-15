## Legacy Parity (Real DB) – Gap Report

### How to run

```bash
npm run e2e:real-db -- tests/e2e/legacy-parity --project=authenticated --workers=1
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
