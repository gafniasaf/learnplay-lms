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

### Current status (2025-12-14)

- **17 passing / 1 failing**

### Remaining failing journey

#### 1) Admin Editor → Audit Variants → Approve

- **Spec**: `tests/e2e/legacy-parity/admin-editor-diff-approve.parity.spec.ts`
- **Observed**: `POST /functions/v1/editor-variants-audit` returns **500**
- **Error body** (truncated):
  - `{"error":{"code":"internal_error","message":"variants-audit failed (404): "}, ... }`
- **Additional evidence (trace console)**:
  - CORS/preflight blocked for `GET /functions/v1/mcp-metrics-proxy?type=summary` from `http://localhost:8081`

**Impact**: Variants diff viewer never opens, so the approve/apply flow cannot be exercised.

**Likely root causes** (backend):

- `editor-variants-audit` is calling an upstream `variants-audit` capability that is **missing (404)** in the linked Supabase project.
- `mcp-metrics-proxy` does not allow CORS from local dev origins (e.g. `http://localhost:8081`), blocking UI metrics calls.

**Fix targets**:

- **Edge**: `supabase/functions/editor-variants-audit` should not depend on a missing `variants-audit` endpoint. Either:
  - deploy the missing function/route it expects, or
  - update it to call the correct MCP handler / job type for variants audit.
- **CORS**: ensure `supabase/functions/mcp-metrics-proxy` responds to preflight and includes allowed origins for local dev.

### Notes

- Admin pages currently use a `localStorage.role` override as part of their guard logic. The E2E setup scripts now set this value explicitly so admin journeys can run deterministically.
- The UI displays an in-app banner: **"Observability proxy unavailable…"** indicating the proxy layer is not active in this environment; parity tests still exercise real Edge functions, but metrics/proxy behaviors are reduced.
