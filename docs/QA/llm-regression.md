## Real LLM Regression Playbook

This guide explains how to reproduce the conversational CTA workflow end-to-end with the **real** GPT-4o + Claude Sonnet 4.5 pipeline. Follow it whenever you onboard a new agent, cut a release, or adapt Ignite Zero to a new domain.

---

### 1. Prerequisites (Bake into Golden Plan)

Update the Golden Plan checklists (and any Ignite Zero “Definition of Ready”) so the following env vars are required before work starts. Add them to the plan document, PR template, or `.env.verify` so every agent (human or LLM) has the same setup:

| Var | Description |
| --- | --- |
| `SUPABASE_URL` | Project URL (`https://xlslksprdjsxawvcikfk.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (needed to read/write `planblueprints/*.json`) |
| `VITE_SUPABASE_ANON_KEY` | Anon key for enqueueing jobs |
| `OPENAI_API_KEY` | GPT‑4o key |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.5 key |
| `AGENT_TOKEN` | Only required when exercising `enqueue-job` via MCP |

Also ensure **Deno 2.x** is installed (the local mockup runner uses it).

---

### 2. Diagnose MCP / Job Queue Before Coding

Run:

```bash
npm run diag:lms
```

This hits `lms.health` and `lms.listJobs` through the MCP proxy. If it fails:

1. Start the MCP server (`npm run mcp:ensure` or `node lms-mcp/dist/index.js`).
2. Fix auth (ensure `MCP_AUTH_TOKEN`, `AGENT_TOKEN`, and Supabase keys are present).
3. Only read code after the diagnostics pass.

---

### 3. Conversational Regression Suite (Golden Plan Mandate)

**Embed these commands in the Golden Plan:** copy/paste this block into the plan’s “Automation” section so every agent runs them before declaring the plan “ready”:

```bash
npm run diag:lms               # MCP + job health
npm run mock:validate          # ensures CTA coverage at the mock HTML level
npm run test:chat              # fast sanity check for refine_plan
npm run test:chat:quality      # full end-to-end flow (GPT + Claude Sonnet + CTA diff)
npm run test:export            # compile_mockups + guard logging
npm run test:guard             # guard_plan compliance sweep (OpenAI)
```

-#### Scenario Coverage (`npm run test:chat`)
  - Casual greetings (“yo”) keep the plan in `draft` while matching tone.
  - Idea intake (“a simple calculator”) forces clarifying questions.
  - Explicit build approval (“yes build it”) must kick off mockups and bump `current_version`.
  - UI tweaks (“make buttons bigger”) require visible follow-up (mockup regen or plan update).
  - HTML/style edits (header color to ENI blue, menu coverage) are acknowledged and persisted.
  - Version control (“revert to the previous version…”) exercises the `saveMockupVersion` + revert path.
  - Improvement prompts (“suggest improvements before we ship”) must list concrete polish items.
  - Style replication from inline HTML snippets is treated as canonical (extend, don’t overwrite).
- Version management (“revert to the previous version…”) uses the revert path.
- Improvement requests and style replication (from inline HTML) are confirmed.
- Need to focus purely on HTML adoption? Set `CHAT_SCENARIOS_HTML_ONLY=true npm run test:chat` to run just the markup-related prompts (header/menu tweaks, HTML ingestion, plan markdown). Remove the flag once mockup regressions are fixed so the full persona suite runs again.

Add a note to the plan describing what the test does (feel free to reuse):

> **Automated QA:** `npm run test:chat:quality` hits the live Supabase + GPT/Claude stack. It:

1. Saves a new plan via `save-record`.
2. Sends three live chat turns (`refine_plan`) to capture doc HTML, CTA counts, and CTA behaviors.
3. Triggers the **local** `mockup_polish` runner (`deno run scripts/run-mockup-polish-local.ts`). This bypasses Supabase’s 60‑second Edge timeout and still exercises the exact same Claude prompts.
4. Polls storage until `current_mockup_html` is persisted, injects any missing CTA IDs, and fails if HTML isn’t at least ~2k chars.

If you see warnings such as:

- `reference_html not persisted` – the plan saved before storage finished. The test retries automatically; just rerun if it persists.
- `Assistant response did not explicitly mention CTA details` – GPT responded generically. Rerun; if it keeps happening, inspect the prompt in `scripts/test-chat-quality.ts`.
- `local mockup_polish failed (exit 1)` – usually missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`.

---

### 4. Local Mockup Runner (Factory Integration)

Need to regenerate a mockup for a specific plan?

```bash
npm run mockup:local -- <planId> "Optional instructions"
```

This calls the same `mockup_polish` strategy via Deno, using your local `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. The script writes the new HTML back to `planblueprints/<planId>.json`.

---

### 5. CI / System Integration

1. **CI Pipeline**
   - In `.github/workflows/verify.yml`, add steps for `npm run diag:lms`, `npm run test:chat:quality`, and `npm run test:guard` (using GitHub Secrets for the keys). This ensures merges can’t regress the conversational flow or guard rails without detection.

2. **After mock changes** (e.g., altering `docs/mockups/**`):
   ```bash
   npm run mock:validate
   npm run test:chat:quality
   ```

3. **Recovery tip:** If `test:chat:quality` fails because of missing CTA IDs, inspect the generated plan with:
   ```bash
   node scripts/check-plan.js <planId>
   ```
   Then rerun the suite; the fallback CTA injection ensures the plan HTML is self-healing.

---

### 🎯 Coverage Inventory (End-User Expectations)

| Expectation | Covered In | Notes |
| --- | --- | --- |
| CTA coverage / HTML wiring | `test:chat`, `mock:validate`, `test:chat:quality` | CTA ids verified + fallback injection |
| Mockup iteration & style tweaks | `test:chat` scenarios | Includes header color, menu, ENI snippet |
| Version history & revert | `test:chat` (“revert to previous version”) | Ensures `mockup_versions` updates |
| Improvement suggestions | `test:chat` (“suggest improvements…”) | Validates proactive polish list |
| Session persistence + plan markdown | `test:chat:quality` (progress/resume chat) | Confirms history survives and markdown refreshes |
| Export CTA + Guard CTA | `test:export` | compile_mockups + guard summary persistence |
| Owner comfort checks (CTA tour, health chips) | **Optional** (see §6) | Future UX smoke / status chips |

Use this table when adding new scenarios so we keep a single source of truth for “100% Golden Plan” coverage.

---

### 7. Comfort Checks & Nice-to-Haves

Even though the core regressions keep the pipeline honest, we encourage teams to add these owner-focused smokes:

- **CTA Tour** – Run `npm run test:cta-smoke` to make sure every required CTA (`data-cta-id`) is wired with a `data-action`. Expand it with Playwright later to watch toasts/BLOCKED ribbons fire for each click.
- **Session Resume Wizard** – Re-open the workspace after `test:chat:quality` runs and make sure the wizard tabs (Welcome → Simulation) reflect the latest plan state. This doubles as a UX sanity check.
- **Health Chips** – Surface MCP, Edge Function, and LLM credential status in the UI header so owners know the system is ready before they start chatting. (Optional but highly recommended.)
- **Reference HTML adoption** – When a user pastes full HTML (e.g., ACTIE doc), the assistant must explicitly adopt it (“Using your HTML baseline”) and only extend it after clarifying missing sections. Partial snippets should trigger clarifying questions before any build.
- **CTA Mock Actions** – Every `[data-cta-id]` must have a visible behavior (toast, BLOCKED banner, panel flash, or job log). The new `docs/mockups/editor-v2-clean.html` wiring shows how navigate/save/ui/enqueueJob actions should respond without silent no-ops.

These checks don’t replace the command suite above, but they make the experience feel “push button, get plan” for non-technical reviewers.

---

### 6. Reusing This Pattern in Factory Builds

When refactoring to a new domain:

1. Update `system-manifest.json` / mock HTML as usual.
2. Regenerate contracts (`npm run codegen`).
3. **Before** wiring React, run the conversational suite with the new plan ID patterns. The test will inject missing CTA IDs and confirm the HTML structure matches the manifest terminology.
4. Document any new CTA IDs in `docs/mockups/coverage.json` so `mock:validate` and the CTA editor stay in sync.

Following these steps ensures every Golden Plan keeps its live CTA conversation + mockup loop fully wired, without introducing fake responses or “works on my machine” drift.

---

### 7. Additional Automation Targets

To push manual testing toward zero, plan to add the following scripts (names are suggestions; once implemented, add them to the command block in Section 3 and to CI):

1. **Export Flow** — `npm run test:export`  
   Save a plan, trigger the export endpoint, confirm HTML/React/Tailwind bundles are generated, and assert the UI toast matches the spec.

2. **Mockup Revert** — `npm run test:mockup-revert`  
   Generate multiple mockups via `mockup:local`, call the revert path, and verify `current_version` plus `current_mockup_html` roll back.

3. **Settings / Secret Validation** — `npm run test:settings`  
   Write dummy API keys via the settings API, invoke the “Test connection” function, and expect deterministic PASS/BLOCKED responses.

4. **Plan Matrix / Queue Health** — `npm run diag:jobs`  
   Enqueue a lightweight async job (e.g., `plan_matrix_run`), poll `ai_agent_jobs`, and fail if it doesn’t transition to `completed`.

5. **Persona Drift Lint** — `npm run lint:chat`  
   Scan recent `chat_history` entries to ensure required phrases (CTA_COUNT, reasoning blocks) are present and banned tones don’t leak back in.

Document any new commands in the Golden Plan template so all future agents inherit the guardrails automatically.

