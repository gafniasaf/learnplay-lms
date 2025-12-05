# Ignite Factory: Golden Input Specification

The "Ignite Factory" architecture separates the **Architect** (the tool that designs the system) from the **Engine** (the clean runtime that builds the system).

For the Engine to build a project successfully, it demands a strict "Golden Input" package. The Agent (Cursor) must NOT start building until `factory-guard` confirms these inputs are present and valid.

## 📦 Input Package Structure

A valid project definition must exist at the root (or a dedicated `_INPUT/` folder) containing:

1.  `system-manifest.json` (The Domain Model)
2.  `PLAN.md` (The Execution Steps)
3.  `mockups/` (Pixel-Perfect HTML)
4.  `user_journey.md` (Behavioral Truth)

---

## 🧪 Cursor Playground Workflow

To keep Ignite Zero clean, boot new projects inside `cursor-playground/`:

1.  Scaffold a workspace: `npm run factory:init "My CRM"`.
2.  Work with Cursor to fill in every file (manifest, plan, journey, mockups).
3.  Run `npm run factory:guard cursor-playground/workspaces/my-crm` until it passes.
4.  (Optional) Generate an e2e skeleton from `user_journey.md`: `npm run factory:auto-spec cursor-playground/workspaces/my-crm`.
5.  (Optional) Snapshot the workspace for history: `npm run factory:package cursor-playground/workspaces/my-crm`.
6.  (Optional) Generate an e2e skeleton from `user_journey.md`: `npm run factory:auto-spec cursor-playground/workspaces/my-crm`.
7.  Import the workspace into Ignite Zero: `npm run factory:import cursor-playground/workspaces/my-crm`.
8.  Start the build from the imported copy: `npm run factory projects/my-crm`.

The `cursor-playground/template/` folder contains starter files.

### Review Reports

After the Engine build, run `npm run factory:review projects/my-crm`. The script writes a Markdown summary under `cursor-playground/reviews/` capturing guard status, spec presence, and TODO counts so the Playground and Engine can improve together.

---
## 1. `system-manifest.json` (The Domain Model)

**Purpose:** Defines the database schema, RLS policies, and background jobs.
**Validation Rule:** Must adhere to the JSON Schema defined in `src/lib/contracts.ts`.

**Required Fields:**
*   `branding.name`: Project Name.
*   `data_model.root_entities`: At least one root entity.
*   `agent_jobs`: List of async jobs the system performs.

---

## 2. `PLAN.md` (The Execution Steps)

**Purpose:** The instruction manual for the Agent. It translates the Manifest and Mockups into code edits.

**Validation Rule:**
*   Must contain a **[Mockup Source]** reference for every UI step.
*   Must contain **[Verification]** steps (e.g., `npm run test:e2e`).

**Example Snippet:**
```markdown
## Step 1: Implement Login Screen
- **Source:** `mockups/login.html`
- **Action:** Create `src/pages/auth/Login.tsx` matching the mockup structure.
- **Verification:** Run `npx playwright test tests/e2e/auth.spec.ts`
```

---

## 3. `mockups/*.html` (The Visual Truth)

**Purpose:** Deterministic visual reference. The Agent does NOT hallucinate UI; it translates this HTML into React + Tailwind.

**Validation Rule:**
*   Must be standalone HTML files.
*   Must use Tailwind CSS classes (or standard CSS).
*   Must correspond 1:1 to the "Lanes" defined in `PLAN.md`.

---

## 4. `user_journey.md` (The Behavioral Truth)

**Purpose:** Defines the "happy path" and critical interactions for E2E testing.

**Validation Rule:**
*   Must describe the flow: `User visits / -> Clicks "Login" -> Enters Credentials -> Redirects to /dashboard`.
*   Used to scaffold the initial Playwright spec *before* code is written.

---

## 🛡️ The Factory Guard Protocol

Before writing any code, the Agent runs `npm run factory:guard`. This script:
1.  Checks if **MCP Server** is running (`lms.health()`).
2.  Checks if **Supabase** is running.
3.  Validates existence of `system-manifest.json`, `PLAN.md`, and `mockups/*.html`.
4.  **HALTS** if any check fails.

