# Golden Plan Factory Guide (v3)

This guide codifies the "Lessons Learned" from building the Golden Plan Generator. Follow this protocol to ensure **100% Ready-to-Use** systems.

## ⚠️ CRITICAL CHECKLIST (Before `factory:guard`)
Run this mental checklist before submitting a Golden Plan:

- [ ] Every `agent_job` has a `prompt_template` (Factory Guard will HALT if missing)
- [ ] Every `data-target="/path"` has a matching `data-route="/path"` mockup
- [ ] Every `enqueueJob` CTA has `data-form="form-id"` to pass context to AI
- [ ] Mockups use semantic HTML (tables, sections, headings) - compiler preserves them
- [ ] `PLAN.md` has "Source:" and "Verification:" sections

## 1. The "Full-Stack" Golden Plan Spec
A valid Golden Plan is NOT just mockups. It must include:

### A. The Brain (Manifest)
Every AI action in the UI must have a corresponding job in `system-manifest.json` with a `prompt_template`.
```json
"agent_jobs": [
  {
    "id": "refine_plan",
    "ui": { "label": "Refine" },
    "prompt_template": "Act as a PM. Review {{title}}, {{status}}. Suggest improvements. Return JSON with 'summary' and 'suggested_actions'." 
  }
]
```
*Why?* Without this, the button clicks but nothing happens. Scaffolding uses the template to generate the logic.
*Enforcement:* `factory-guard.ts` now validates this and will HALT if any job lacks a `prompt_template`.

### B. The Body (Mockups)
*   **Navigation Completeness:** Every `data-target="/foo"` must have a matching mockup file (e.g., `foo.html`).
*   **Static Content:** The compiler preserves tables, text, and layout. Do not rely on JS to render initial state.
*   **Form Context for AI:** `enqueueJob` CTAs should include `data-form="form-id"` to pass form data to the AI job.

## 2. The Build Sequence (Strict)
Do not skip steps.

1.  **Guard:** `npm run factory:guard -- <workspace>` (Validates routes/specs)
2.  **Scaffold:** `npx tsx scripts/scaffold-manifest.ts`
    *   *Crucial:* Generates `contracts.ts`, `registry.ts`, and `strategies/gen-*.ts`.
    *   *Note:* If manifest structure changes, update the scaffolder (we did this for v2).
3.  **Compile:** `npx tsx scripts/compile-mockups.ts <workspace>`
    *   *Crucial:* Transforms HTML to React. Now preserves static content (Tables/Divs).
4.  **Build:** `npm run build` (Verifies types/assets)

## 3. The Connection Protocol
To go from "Mock" to "Production":

1.  **Env Vars:** You must set credentials for **BOTH** Frontend and MCP.
    *   Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MCP_AUTH_TOKEN`
    *   MCP: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, `MCP_AUTH_TOKEN`
2.  **CORS:** The MCP server must allow the Frontend origin. (Patched in `lms-mcp/src/index.ts`).
3.  **Restart:** Env vars are loaded at process start. Restart `npm run dev` and `lms-mcp` if you change keys.

### Local Runner Mode (Recommended for Development)
Instead of deploying Edge Functions to Supabase, use Local Runner:
```bash
cd lms-mcp
USE_LOCAL_RUNNER=true OPENAI_API_KEY=sk-... npx tsx src/index.ts
```
This executes AI strategies directly in Node.js via `registry.ts`, bypassing remote deployment.

## 4. Troubleshooting
*   **"Something went wrong" / White Screen:** Check console for "Failed to fetch dynamically imported module". Usually syntax error in generated `.tsx`. Check `compile-mockups.ts` regex.
*   **CORS Error:** Verify `lms-mcp` is running and has CORS headers enabled.
*   **Missing Table:** Ensure `compile-mockups.ts` is using the "DOM Transformation" logic, not the old "Extraction" logic.

---
**Philosophy:**
*   **Manifest First:** The Manifest generates the Database, the Contracts, and the Brain.
*   **Mockup Driven:** The HTML generates the UI.
*   **Zero Manual Glue:** If you have to write glue code manually, the Factory is broken. Fix the Factory scripts instead.

