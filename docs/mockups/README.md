## Mock Coverage Workflow

Golden Plan reviews start from the mocks. Every route/state/CTA listed in `coverage.json` must be visible and clickable in HTML **before** React wiring or API work begins.

### 1. Review the Coverage Matrix
- File: `docs/mockups/coverage.json`
- Fields:
  - `routes[].states[]`: Required route states and their HTML files.
  - `routes[].requiredCTAs[]`: CTA IDs that must exist (via `data-cta-id`) inside the default/populated state.
  - `sharedComponents`: Global widgets (hamburger menu, toast system, etc.) that must be present everywhere they’re used.

### 2. Use the CTA Editor Mock
- Open `docs/mockups/cta-editor.html` directly in the browser.
- Pick a route/state from the left rail and review the CTA table in the center pane.
- AI Suggestions banner lists missing CTAs parsed from the plan dump. Use **Accept / Edit / Reject** to keep the matrix consistent.
- When you accept a CTA the mock should be updated with the correct `data-cta-id`, `data-action`, and `data-target`/`data-job-type` attributes. Treat this mock like a product review step—every CTA needs a visible, testable behavior.
- The preview panel on the right highlights the element so you can double check that the user interaction is discoverable.

### 3. Sync Coverage + Mocks
1. Update the actual mock file (e.g. `docs/mockups/editor/default.html`) so the CTA table matches reality.
2. Keep `coverage.json` in sync with any new CTA IDs or route states.
3. Commit both files together so `git blame` always shows paired changes.

### 4. Validate
- Run `npm run mock:validate`. This script parses every mock HTML file and ensures:
  - `data-route` matches the entry in `coverage.json`.
  - Required CTAs exist in the default/populated state.
  - Required states actually have an HTML file.
- Fix any warnings/errors before handing mocks over to React.

### 5. Wire E2E Coverage
- `tests/e2e/learnplay-journeys.spec.ts` tests core user journeys (Learner, Teacher, Parent flows) with CTA assertions.
- Once mocks + tests pass, React implementation can plug directly into MCP/Supabase knowing all user journeys already exist.

By following this workflow you stay in “approve/reject” mode (no manual HTML grinding) while still guaranteeing 100% CTA coverage. The CTA editor mock is the single source of truth for product review; `coverage.json` and `mock:validate` keep it honest.

### 6. Re-export from the live React app
- Use the exporter: `npx tsx scripts/export-mocks.ts` (expects dev server on `http://localhost:8081`; override with `MOCK_BASE_URL`).
- The script visits all routes, stamps `data-route`, captures HTML to `docs/mockups/**/default.html`, and regenerates `coverage.json` (including any `data-cta-id` it finds).
- The exporter runs against whatever the app renders (IgniteZero is live-only). For stable exports, point the dev server at a stable test org/dataset.
- After changes, rerun: `npx tsx scripts/export-mocks.ts && npm run mock:validate && npm run verify`.

### 7. Fixture and env notes
- If the dev server isn’t on 8080/8081, set `MOCK_BASE_URL`, e.g., `MOCK_BASE_URL=http://localhost:8083 npx tsx scripts/export-mocks.ts`.
