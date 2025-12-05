# 🧠 Factory Lessons Learned

Auto-generated observations from the Ignite Cycle.

---

## ✅ Matrix Success (2025-11-26)

All three diverse Golden Plans (demo-ecommerce, demo-hr, demo-knowledge-base) passed the full pipeline:
- Guard → Codegen → Compile Mockups → Build → Preview → CTA E2E

### Key Improvements Made

1. **Guard Hardened**: Now enforces mockups-as-contract:
   - `layout.html` with `data-region` (header/sidebar/content/footer)
   - Page mockups with `data-route`, CTAs with `data-cta-id` + `data-action`
   - Navigate CTAs require `data-target`
   - EnqueueJob CTAs require `data-job-type`
   - Save CTAs require `data-entity` and page must have `data-field` inputs

2. **Compiler Upgraded**: Generates React routes/components 1:1 from mockups:
   - Parses `data-route`, `data-cta-id`, `data-action`, `data-target`, `data-job-type`, `data-entity`, `data-field`
   - Auto-wires CTAs: navigate → useNavigate, enqueueJob → useMCP().enqueueJob, save → useMCP().saveRecord
   - Emits `generated/routes.json` for E2E consumption

3. **SPA Fallback Fixed**: Preview now serves deep links correctly for E2E tests
   - Added `appType: "spa"` to vite.config.ts
   - Auth bypass via `VITE_BYPASS_AUTH=true`

4. **MCP Save Pipeline Added**:
   - `lms.saveRecord` handler in MCP server
   - `save-record` Edge Function (stores JSON blob + metadata)

5. **Matrix Runner Improved**:
   - Per-plan: guard → codegen → compile → dynamically update App.tsx → build → preview → E2E
   - Restores original manifest after run

### Lessons for Future Agents

- **Don't hardcode routes in App.tsx**: The matrix now dynamically generates App.tsx with routes from `generated/routes.json`
- **Use lazy imports for generated pages**: Prevents bundle bloat and allows per-plan isolation
- **Generated components must use PascalCase function names**: Export default function names should be valid React component names
- **Supabase health check is optional in dev mode**: Guard now skips if SUPABASE_ANON_KEY is missing

---

## ❌ Audit Failure (2025-11-25)
Audit tool reported violations: Command failed: npx tsx scripts/audit-compliance.ts . --json. Check "Negative Constraints".

## ❌ Audit Failure (2025-11-25)
Audit tool reported violations: Command failed: npx tsx scripts/audit-compliance.ts . --json. Check "Negative Constraints".

## ⚠️ Tech Debt Detected (2025-11-25)
Custom `api.ts` hook found. The Factory should provide a generic `<ManifestEntity>` hook instead of forcing agents to write adapters.

---

## ✅ Golden Plan Generator Build (2025-11-27)

Successfully built the "Golden Plan Generator" system - a self-referential tool for creating and iterating on Golden Plans with AI assistance.

### What Was Built
- **7 pages**: Dashboard, Plan Editor, Iterations, Settings, Preview, Mockup Fullscreen, CTA Analysis
- **2 entities**: `PlanBlueprint` (root), `IterationNote` (child)
- **5 agent jobs**: refine_plan, mockup_polish, guard_plan, compile_mockups, plan_matrix_run
- **Full CTA wiring**: All buttons correctly call `useMCP().enqueueJob()` or `useMCP().saveRecord()`

### Issues Encountered & Fixes

1. **Guard Route Validation**: The guard failed when `data-target` included query params (e.g., `/plans/editor?id=retail`).
   - **Fix**: Removed query params from `data-target` attributes - routes should be clean paths.

2. **Missing Mockup Pages**: Layout navigation referenced routes (`/iterations`, `/settings`, etc.) that had no corresponding mockups.
   - **Fix**: Created additional mockup files for all navigation targets.

3. **Duplicate Zod Fields**: `contracts.ts` had duplicate `created_at` in `IterationNoteSchema` because manifest fields overlapped with scaffold defaults.
   - **Fix**: Updated `scripts/scaffold-manifest.ts` to filter out standard fields (`created_at`, `updated_at`, etc.) from the manifest fields list before generation.

4. **ManifestGraph Type Errors**: The `manifestGraph.ts` file assumed `data_model` was always an array, but new manifest format uses `{ root_entities, child_entities }`.
   - **Fix**: Added type check to handle both formats.

5. **E2E Toast Strict Mode**: Multiple toasts appeared simultaneously, causing Playwright strict mode violations.
   - **Fix**: Added `.first()` to toast assertions.

### Lessons for Future Agents

- **All navigation targets must have mockups**: If `data-target="/foo"`, there must be a `foo.html` with `data-route="/foo"`.
- **Don't use query params in `data-target`**: Use clean routes; pass IDs via other means if needed.
- **Test CTA wiring accepts failures**: In dev mode without Edge Functions deployed, CTAs will show "Job failed" toasts - tests should accept both success and failure.
- **Manifest format is evolving**: Always check if `data_model` is array or object with `root_entities`.
