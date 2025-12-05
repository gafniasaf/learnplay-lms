# Legacy Course Reference (Archived)

Ignite Zero previously shipped a course-centric domain (Course/CourseItem, media library, conversational editor). Those specs are still valuable history, but they no longer represent the active Project/Task manifest. To avoid confusing Cursor or other agents during semantic searches, the complete documents now live under `docs/_ARCHIVED_LEGACY_COURSE/`, which is excluded from default indexing.

## When to read the archive
- Porting or auditing older releases that still reference `Course` entities.
- Comparing the new ProjectBoard/TaskItem flows to the original course editor and media pipeline.
- Pulling copy, diagrams, or migration notes for Factory imports that originated before the manifest refactor.

## How to access
1. Open the `docs/_ARCHIVED_LEGACY_COURSE/` folder manually.
2. Files retain their original names (e.g., `EDIT_BUTTON_IMPLEMENTATION.md`, `UNIFIED_COURSE_EDITOR_PLAN.md`, `MEDIA_STORAGE_STANDARDS.md`) with the exact historical content.
3. Treat everything there as read-only reference. Do not revive APIs like `getCourse` without first updating `system-manifest.json` and re-running `npx tsx scripts/scaffold-manifest.ts`.

If we revive a course-style domain in the future, move the relevant files back into the main `docs/` tree and refresh them to match the new manifest so agents can rely on them directly.


