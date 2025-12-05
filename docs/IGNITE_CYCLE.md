# 🔄 THE IGNITE CYCLE

**Protocol for Agent-Driven Development in Ignite Zero.**

This document defines the lifecycle of a feature or domain in the factory.

## 1. 🔥 IGNITE (Build Phase)

**Goal:** Prove the Factory can build the target domain.

1.  **Input:** Create a Golden Plan (Workspace) in `cursor-playground/workspaces/[domain-slug]`.
    *   `system-manifest.json` (The DNA)
    *   `PLAN.md` (The Instructions)
    *   `mockups/` (The Vision)
2.  **Initialize:** Run `npm run factory:import [workspace-path]`.
3.  **Scaffold:** The system automatically generates `contracts.ts` and `strategies/`.
4.  **Implement:** The Agent (You) implements the React Components in `src/pages/[domain-slug]`.
    *   *Constraint:* Must use `useMCP()` for all data/actions.
    *   *Constraint:* Must use generic components where possible.

## 2. 🌾 HARVEST (Verification Phase)

**Goal:** Gather data on the quality of the build.

1.  **Audit:** Run `npx tsx scripts/audit-compliance.ts [target-dir]`.
    *   *Checks:* No direct Supabase calls? No hardcoded "Course" strings?
2.  **Verify:** Run `npm run factory:auto-spec` -> `npm run e2e`.
    *   *Checks:* Does the UI actually work?
3.  **Intelligence Check:** (If AI Jobs exist)
    *   Run `npm run mcp:ensure`.
    *   Run `npx tsx scripts/verify-mcp-flow.ts` (or equivalent).

## 3. 🧹 CLEAN (Reset Phase)

**Goal:** Maintain the "Generic Seed" property.

*   **Dispose:** Delete `src/pages/[domain-slug]`.
*   **Dispose:** Delete `projects/[domain-slug]`.
*   **Dispose:** Delete `tests/e2e/[domain-slug].spec.ts`.
*   **Reset:** Run `npm run factory:reset` to clear generated routes/pages and scrub `.env.local`.
*   **Preserve:** Keep `cursor-playground/workspaces/[domain-slug]`.

**Why?**
Ignite Zero is a **Factory**, not a **Warehouse**. We don't store finished cars on the assembly line. We store the *Blueprints* (Golden Plans).

## 4. 🚀 IMPROVE (Evolution Phase)

**Goal:** Make the Factory smarter for the next cycle.

*   If the build failed, fix the **Tooling** (`scripts/`), not just the **Instance**.
*   If the Agent failed the audit, update `docs/AI_CONTEXT.md` (The Constitution).
*   If the AI Job failed, update `scripts/scaffold-manifest.ts` (The Generator).

