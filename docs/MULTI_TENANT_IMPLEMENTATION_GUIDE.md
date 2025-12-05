# Multi-Tenant Implementation Guide

**Status:** Phase 1 Complete (Schema & Migrations)  
**Date:** 2025-10-25  
**Remaining:** Phases 2-12

---

## ✅ Phase 1: Schema & Migrations (COMPLETE)

### Completed

- [x] ADR 004: Minimal Hybrid Multi-Tenancy
- [x] Multi-Tenant Architecture documentation
- [x] Migration: `20251025200000_multi_tenant_organizations.sql`
  - organizations table
  - organization_domains table
  - Helper functions (is_superadmin, get_user_org_ids, has_org_role)
  - RLS policies
  - Seed data (default LearnPlay org)
- [x] Migration: `20251025200001_multi_tenant_user_roles.sql`
  - user_roles table
  - Per-org RBAC with superadmin support
  - Role helper functions
- [x] Migration: `20251025200002_multi_tenant_tags.sql`
  - tag_types table (curated taxonomy types)
  - tags table (allowed values)
  - tag_approval_queue table (AI suggestions)
  - Validation triggers
  - Seed data (global tag types and tags)
- [x] Migration: `20251025200003_multi_tenant_course_metadata.sql`
  - course_metadata table
  - course_versions table (JSON snapshots)
  - Helper functions (restore, list versions, tag filtering)
- [x] Migration: `20251025200004_multi_tenant_media_embeddings.sql`
  - Added organization_id to media_assets
  - Added organization_id to content_embeddings
  - Updated RLS policies for multi-tenancy
- [x] Backfill script: `scripts/backfill-course-metadata.ts`
  - Lists courses from storage
  - Creates course_metadata rows
  - Extracts and queues AI-suggested tags
  - Generates validation report
- [x] Migration tests: `tests/migrations/organizations.test.ts`
  - RLS validation for orgs and domains
  - Superadmin vs org user access control

### Artifacts

- `docs/adr/004-minimal-hybrid-multi-tenancy.md`
- `docs/MULTI_TENANT_ARCHITECTURE.md`
- `supabase/migrations/20251025200000-20251025200004*.sql` (5 files)
- `scripts/backfill-course-metadata.ts`
- `tests/migrations/organizations.test.ts`
- `package.json` updated with `backfill:metadata` script

---

## 🚧 Phase 2: API Layer (Edge Functions)

### To Implement

#### 2.1 GET /org/config
- **Status:** Partial (shell created in `supabase/functions/org-config/index.ts`)
- **Returns:** Organization branding, curated tag types/tags, variant config
- **Auth:** Authenticated users; superadmin can query any org
- **Testing:** Integration test in `tests/integration/org-config.test.ts`

#### 2.2 GET /courses (with filters)
- **File:** `supabase/functions/list-courses-filtered/index.ts`
- **Query Params:**
  - `organizationId` (optional, superadmin only)
  - `visibility` (`org` | `global`)
  - `tagIds` (comma-separated UUIDs)
  - `matchAll` (boolean, AND vs OR tag logic)
  - `search` (semantic search query)
  - `limit`, `offset`
- **Returns:** Paginated course_metadata list with tag details
- **Auth:** RLS-enforced; users see own org + global courses
- **Testing:** `tests/integration/list-courses-filtered.test.ts`

#### 2.3 POST /courses/:id/publish
- **File:** `supabase/functions/publish-course/index.ts`
- **Body:**
  ```json
  {
    "changelog": "Added beginner variants"
  }
  ```
- **Logic:**
  1. Validate user has editor/org_admin role for course's org
  2. Load current course JSON from storage
  3. Validate all tags exist in tags table
  4. Bump `content_version` and `etag` in course_metadata
  5. Create course_versions snapshot
  6. Trigger async job to regenerate embeddings
  7. Invalidate CDN cache (future: POST to CDN purge API)
- **Returns:** `{ version, snapshotId, contentVersion, etag, publishedAt }`
- **Testing:** `tests/integration/publish-course.test.ts`

#### 2.4 POST /courses/:id/restore/:version
- **File:** `supabase/functions/restore-course-version/index.ts`
- **Body:**
  ```json
  {
    "changelog": "Restored from version 3"
  }
  ```
- **Logic:**
  1. Call `restore_course_version(courseId, version, changelog)` function
  2. Returns new version ID (non-destructive restore)
  3. Invalidate CDN cache
- **Returns:** `{ newVersion, restoredFromVersion, snapshotId, etag }`
- **Testing:** `tests/integration/restore-course.test.ts`

#### 2.5 Admin Tag CRUD
- **Files:**
  - `supabase/functions/admin-tag-types/index.ts` (GET, POST, PATCH, DELETE)
  - `supabase/functions/admin-tags/index.ts` (GET, POST, PATCH, DELETE)
- **Auth:** org_admin or superadmin
- **Testing:** `tests/integration/admin-tags.test.ts`

#### 2.6 PATCH /courses/:id/metadata
- **File:** `supabase/functions/update-course-metadata/index.ts`
- **Body:**
  ```json
  {
    "tagIds": ["uuid1", "uuid2"],
    "visibility": "global"
  }
  ```
- **Logic:**
  1. Validate tags exist
  2. Update course_metadata
  3. Bump etag
- **Returns:** Updated course_metadata
- **Testing:** `tests/integration/update-course-metadata.test.ts`

### Client-Side API Wrappers

Create in `src/lib/api/`:

- `orgConfig.ts`: `getOrgConfig(organizationId?, slug?)`
- `coursesFiltered.ts`: `getCoursesByTags(filters)`
- `publishCourse.ts`: `publishCourse(courseId, changelog)`
- `restoreCourse.ts`: `restoreCourse(courseId, version, changelog)`
- `adminTags.ts`: CRUD for tag_types and tags
- `updateCourseMetadata.ts`: `updateCourseMetadata(courseId, { tagIds, visibility })`

---

## 🚧 Phase 3: Tag Management UI

### 3.1 Tag Management Admin Page
- **File:** `src/pages/admin/TagManagement.tsx`
- **Features:**
  - List tag types (domain, level, theme, etc.)
  - Enable/disable, reorder, rename labels
  - CRUD for allowed tag values per type
  - Bulk import tags from CSV
- **Testing:** `src/pages/admin/TagManagement.test.tsx`

### 3.2 Tag Approval Queue
- **File:** `src/pages/admin/TagApprovalQueue.tsx`
- **Features:**
  - List pending AI-suggested tags per course
  - Map suggestion → existing tag (dropdown)
  - Create new tag (inline form)
  - Approve all / reject
- **Testing:** `src/pages/admin/TagApprovalQueue.test.tsx`

### Components
- `src/components/admin/tags/TagTypeManager.tsx`
- `src/components/admin/tags/TagValueEditor.tsx`
- `src/components/admin/tags/TagApprovalCard.tsx`

---

## 🚧 Phase 4: Variants (JSON-Embedded)

### 4.1 Variant Resolution Utility
- **File:** `src/lib/utils/variantResolution.ts`
- **Functions:**
  - `resolveVariant(variants, userLevel, defaultLevel)`
  - `resolveItem(item, level)` → resolved stem, options, explanation
- **Testing:** `src/lib/utils/variantResolution.test.ts`

### 4.2 Update Course TypeScript Types
- **File:** `src/lib/types/courseVNext.ts`
- **Interface:** CourseVNext (with embedded variants)
  ```typescript
  interface CourseVNext {
    id: string;
    organizationId: string;
    contentVersion: number;
    etag: number;
    tags?: { domain?: string[]; level?: string[]; };
    variants: {
      difficulty: {
        levels: Array<{ id: string; label: string; order: number }>;
        default: string;
      };
    };
    items: Array<{
      stem: {
        variants: { beginner?: string; intermediate?: string; advanced?: string; expert?: string; };
        media?: { variants?: { beginner?: MediaAsset[]; ... }; };
      };
      // ... options, explanation with variants
    }>;
  }
  ```

### 4.3 Update Play Flow
- **File:** `src/pages/Play.tsx`
- **Changes:**
  - Read `userSelectedLevel` from user profile or org default
  - Resolve item fields using `resolveItem(item, level)`
  - Render resolved text and media
- **Testing:** E2E test for variant switching

### 4.4 Update Course Editor
- **File:** `src/pages/admin/CourseEditor.tsx`
- **Changes:**
  - Add variant level selector (beginner/intermediate/advanced/expert)
  - StemTab, OptionsTab, ReferenceTab show/edit per-level variants
  - Persist variants inside course JSON
- **Testing:** Unit tests for variant editing

---

## 🚧 Phase 5: Publish Pipeline & Versioning

### 5.1 Update AI Course Generation
- **Files:**
  - `supabase/functions/generate-course/index.ts`
  - `supabase/functions/chat-course-assistant/index.ts`
- **Changes:**
  - AI returns `suggestedTags: { domain: [...], level: [...] }`
  - Create tag_approval_queue entry
  - Do NOT auto-assign tag_ids (pending approval)

### 5.2 Publish Workflow
- **Edge Function:** `supabase/functions/publish-course/index.ts` (from Phase 2)
- **UI:** Add "Publish" button to Course Editor
  - Shows modal: "Enter changelog"
  - Calls `publishCourse(courseId, changelog)`
  - Success toast: "Version X published"
  - Redirect to version history page

### 5.3 Version History UI
- **File:** `src/pages/admin/CourseVersionHistory.tsx`
- **Features:**
  - List versions with changelog, timestamp, user
  - "View Snapshot" (modal with JSON preview)
  - "Restore to This Version" button
- **Testing:** E2E test for publish → restore flow

### 5.4 Embedding Regeneration (Async Job)
- **Edge Function:** `supabase/functions/regenerate-embeddings/index.ts`
- **Triggered By:** publish-course
- **Logic:**
  1. Compare old vs new snapshot
  2. Identify changed items
  3. For each level variant:
     - Generate embedding for stem.variants[level]
     - Upsert into content_embeddings
  4. Update job status

---

## 🚧 Phase 6: Course Selector & Catalog

### 6.1 Update CourseSelector
- **File:** `src/pages/admin/CourseSelector.tsx`
- **Changes:**
  - Fetch courses via `getCoursesByTags()` instead of catalog.json
  - Add tag filter chips (fetched from org-config)
  - Support AND/OR filter logic toggle
  - Pagination controls
  - Fallback to catalog.json if course_metadata empty (migration period)
- **Testing:** `src/pages/admin/CourseSelector.test.tsx`

### 6.2 Catalog Transition Plan
- **Step 1:** Deploy CourseSelector with dual mode (metadata + fallback)
- **Step 2:** Run backfill script: `npm run backfill:metadata`
- **Step 3:** Validate report: `reports/backfill-metadata-*.md`
- **Step 4:** If validated, set env var `USE_COURSE_METADATA=true`
- **Step 5:** Monitor for 1 week
- **Step 6:** Deprecate catalog.json fallback

---

## 🚧 Phase 7: Auth & Roles

### 7.1 Replace Email-Based Admin Checks
- **Files to Update:**
  - `src/hooks/useAuth.ts`
  - `src/pages/Admin.tsx`
  - `src/components/courses/CourseCard.tsx`
  - All admin pages
- **Changes:**
  ```typescript
  // OLD
  const isAdmin = user?.email?.includes('admin');
  
  // NEW
  const isAdmin = user?.app_metadata?.role === 'admin' || 
                  user?.user_metadata?.role === 'admin' ||
                  await checkUserRole(user.id, 'org_admin');
  ```
- **Helper:** `src/lib/api/roles.ts` → `getUserRoles()`, `checkUserRole(userId, role, orgId?)`

### 7.2 SSO Configuration UI
- **File:** `src/pages/admin/SSOSettings.tsx`
- **Features:**
  - Add/edit OIDC providers (Google, Microsoft Entra)
  - Configure client ID, secret, issuer URL
  - Test connection button
  - Enable/disable per provider
- **Storage:** Encrypted in `organizations.settings.sso`

---

## 🚧 Phase 8: CDN Caching & Invalidation

### 8.1 Cache Headers
- **Supabase Storage:** Already supports Cache-Control headers
- **Configuration:**
  - Courses JSON: `max-age=3600, must-revalidate`
  - Resolved snapshots: `max-age=604800, immutable`
- **Implementation:** Set via Supabase Storage policies or CloudFlare rules

### 8.2 Cache Invalidation
- **Edge Function:** `supabase/functions/invalidate-cache/index.ts`
- **Triggered By:** publish-course, restore-course
- **Logic:**
  - POST to CDN purge API (Cloudflare, Fastly, etc.)
  - Purge paths: `/courses/${courseId}.json`, `/courses/${courseId}/resolved/*.json`

---

## 🚧 Phase 9: Telemetry

### 9.1 Event Tracking
- **Tool:** Sentry (already integrated)
- **Events:**
  - `tag.created`, `tag.updated`, `tag.approved`
  - `course.published`, `course.restored`
  - `variant.switched`
  - `search.media`, `search.content`
- **Implementation:** Add `Sentry.addBreadcrumb()` calls in API wrappers

### 9.2 Performance Monitoring
- **Metrics:**
  - Course load time (with variants)
  - Tag filter query time
  - Publish duration
- **Implementation:** `performance.mark()` + `performance.measure()` → send to Sentry

---

## 🚧 Phase 10: Documentation

### 10.1 HOW_TO_RUN.md
- **Sections:**
  - Prerequisites (Node, Supabase CLI)
  - Environment setup
  - Running migrations
  - Backfill metadata
  - Starting dev server
  - Running tests (unit, integration, E2E)
  - Deploying edge functions

### 10.2 TECHNICAL_INFO.md
- **Sections:**
  - Architecture overview
  - Multi-tenancy model
  - Curated tags workflow
  - Variant resolution
  - Publishing & versioning
  - RLS policies summary
  - Troubleshooting

### 10.3 Update API_REFERENCE.md
- **New Endpoints:**
  - GET /org/config
  - GET /courses (filtered)
  - POST /courses/:id/publish
  - POST /courses/:id/restore/:version
  - Tag admin CRUD endpoints
  - PATCH /courses/:id/metadata

### 10.4 Disaster Recovery Procedures
- **File:** `docs/DISASTER_RECOVERY.md`
- **Sections:**
  - Database backup/restore
  - Storage backup/restore
  - Course version rollback
  - Tag restoration
  - Org data export

---

## 🚧 Phase 11: E2E Tests (Playwright)

### Tests to Write

1. **Multi-Tenant Isolation**
   - `tests/e2e/multi-tenant-isolation.spec.ts`
   - Verify org A user cannot see org B courses

2. **Tag Approval Workflow**
   - `tests/e2e/tag-approval.spec.ts`
   - AI suggests tags → admin maps → publish → course visible with filters

3. **Publish & Restore**
   - `tests/e2e/publish-restore.spec.ts`
   - Edit course → publish → view history → restore → verify changes

4. **Variant Switching**
   - `tests/e2e/variant-switching.spec.ts`
   - User selects level → play course → verify correct variant text shown

5. **Course Selector Filters**
   - `tests/e2e/course-selector-filters.spec.ts`
   - Filter by domain tag → verify results
   - Filter by multiple tags (AND/OR) → verify logic

---

## 🚧 Phase 12: Rollout

### 12.1 Pre-Launch Checklist
- [ ] All migrations applied to staging
- [ ] Backfill script run and validated
- [ ] All E2E tests passing
- [ ] Performance benchmarks meet targets (<2s course load)
- [ ] Security audit (RLS policies, auth checks)
- [ ] Documentation complete

### 12.2 Staged Rollout
1. **Week 1:** Deploy to staging, internal testing
2. **Week 2:** Deploy to production for default org only
3. **Week 3:** Create 2-3 pilot orgs, gather feedback
4. **Week 4:** Open to all orgs, full rollout

### 12.3 Post-Launch Monitoring
- **Metrics:**
  - Course load latency (p50, p95, p99)
  - Tag filter query latency
  - Publish success rate
  - RLS policy enforcement (0 cross-org leaks)
- **Alerts:**
  - Failed publishes
  - Tag validation errors
  - High latency (>5s)

---

## Quick Start (For Developers)

### Apply Migrations
```bash
# From project root
supabase db push
```

### Run Backfill
```bash
npm run backfill:metadata
```

### Start Dev Server
```bash
npm run dev
```

### Run Tests
```bash
npm run test              # Unit tests
npm run e2e               # E2E tests
```

---

## Current Status Summary

| Phase | Status | Completion |
|-------|--------|------------|
| 0. Decisions | ✅ Complete | 100% |
| 1. Schema & Migrations | ✅ Complete | 100% |
| 2. API Layer | 🚧 In Progress | 15% |
| 3. Tag Management UI | ⏳ Not Started | 0% |
| 4. Variants (JSON) | ⏳ Not Started | 0% |
| 5. Publish Pipeline | ⏳ Not Started | 0% |
| 6. Course Selector | ⏳ Not Started | 0% |
| 7. Auth & Roles | ⏳ Not Started | 0% |
| 8. CDN Caching | ⏳ Not Started | 0% |
| 9. Telemetry | ⏳ Not Started | 0% |
| 10. Documentation | 🚧 In Progress | 20% |
| 11. E2E Tests | ⏳ Not Started | 0% |
| 12. Rollout | ⏳ Not Started | 0% |

**Overall Completion:** ~20% (Phase 1 + docs)

---

## Estimated Effort Remaining

- **API Layer:** 16 hours
- **Tag Management UI:** 12 hours
- **Variants:** 8 hours
- **Publish Pipeline:** 10 hours
- **Course Selector:** 6 hours
- **Auth & Roles:** 8 hours
- **CDN Caching:** 4 hours
- **Telemetry:** 3 hours
- **Documentation:** 6 hours
- **E2E Tests:** 12 hours
- **Rollout:** 4 hours

**Total:** ~89 hours (11-12 full days)

---

## Next Immediate Steps

1. Complete Edge Functions (Phase 2): org-config, list-courses-filtered, publish-course, restore-course
2. Create client-side API wrappers
3. Build Tag Management UI (Phase 3)
4. Implement variant resolution utility (Phase 4)
5. Write E2E tests for critical paths (Phase 11)

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-25  
**Owner:** Engineering Team

