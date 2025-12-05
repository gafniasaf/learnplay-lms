# Cursor Playground

This folder is not shipped with Ignite Zero. It's a sandbox where you (with Cursor) craft the perfect Golden Plan before the Engine does any work.

## Workflow
1. Run `npm run factory:init <ProjectName>` to scaffold a new workspace under `cursor-playground/workspaces`.
2. Iterate inside Cursor to fill in `system-manifest.json`, `PLAN.md`, `user_journey.md`, and `mockups/`.
3. Use `npm run factory:guard <workspace>` until it passes without errors.
4. (Optional) Snapshot the workspace for future reference: `npm run factory:package <workspace>`.
5. (Optional) Generate an e2e skeleton from `user_journey.md`: `npm run factory:auto-spec <workspace>`.
6. Run `npm run factory:import <workspace>` to copy the validated pack into `projects/<slug>`.
7. Kick off the build from the imported copy with `npm run factory projects/<slug>`.

## Reference Workspace

See `cursor-playground/examples/demo-mini-crm/` for a fully populated workspace that passes the guard out of the box. Use it as a baseline when explaining the workflow to new collaborators.

## Reviews

After the Engine build, run `npm run factory:review projects/<slug>` to capture guard status, spec coverage, and TODO counts. Reports are stored in `cursor-playground/reviews/` so the Playground and Engine can iterate together.

