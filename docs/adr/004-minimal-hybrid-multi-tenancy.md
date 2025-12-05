# ADR 004: Minimal Hybrid Multi-Tenancy Architecture

**Status:** Accepted  
**Date:** 2025-10-25  
**Deciders:** Product Team, Engineering Team

## Context

The LearnPlay Platform requires multi-tenant white-label capabilities with:
- Organization isolation (schools, districts, institutions)
- Custom branding per organization (logo, colors, domain)
- Curated course taxonomies (tags) with per-org control
- Adaptive content variants (beginner/intermediate/advanced/expert)
- Version control with rollback
- Semantic search across courses and media

We need to balance:
1. **Performance**: Current system serves courses from JSON files in Supabase Storage (1 fetch/course)
2. **Flexibility**: New requirements need relational metadata (tags, org scoping, versions)
3. **Migration Risk**: Existing Course Editor and Play flow depend on JSON structure
4. **Scale**: 10,000 courses, 1,000 organizations

## Decision

We adopt a **Minimal Hybrid** approach:
- **Keep courses as JSON files** in Supabase Storage (`courses/{id}.json`)
- **Add relational metadata tables** for multi-tenancy, tags, versions
- **Embed variants in JSON**, resolve client-side (no runtime DB resolution)
- **Curated tags** managed by admins; AI suggests, admins approve/map
- **Full JSON snapshots** on publish for versioning/rollback

### Architecture Components

#### 1. Multi-Tenancy Model
- Single Supabase instance, tenant isolation via `organization_id` + RLS
- Roles: `superadmin` (global), `org_admin`, `editor`, `viewer` (per-org)
- Shared course library (visibility: `global`) + org-private courses (visibility: `org`)

#### 2. Course Storage (Hybrid)
```
Metadata (PostgreSQL):
- organizations (id, name, slug, branding, settings)
- organization_domains (org_id, domain, is_primary, verified_at)
- course_metadata (id, organization_id, visibility, tags, updated_at)
- course_versions (id, course_id, version, snapshot JSONB, published_at)

Content (Storage):
- courses/{id}.json (with embedded variants, tags, contentVersion)
- courses/{id}/resolved/{level}.json (optional pre-resolved snapshots)
```

#### 3. Variants (JSON-Embedded)
```json
{
  "id": "heart-anatomy",
  "organizationId": "uuid",
  "contentVersion": 5,
  "etag": 42,
  "variants": {
    "difficulty": {
      "levels": [
        {"id": "beginner", "label": "Beginner", "order": 0},
        {"id": "intermediate", "label": "Intermediate", "order": 1},
        {"id": "advanced", "label": "Advanced", "order": 2},
        {"id": "expert", "label": "Expert", "order": 3}
      ],
      "default": "intermediate"
    }
  },
  "items": [
    {
      "stem": {
        "variants": {
          "beginner": "What pumps blood?",
          "intermediate": "What is the primary function of the heart?",
          "advanced": "Describe the cardiac cycle.",
          "expert": "Explain the electrical conduction system of the myocardium."
        }
      },
      "explanation": {
        "variants": {
          "beginner": "<p>The heart pumps blood through your body.</p>",
          "advanced": "<p>The myocardium contracts via the SA node...</p>"
        }
      }
    }
  ]
}
```

**Resolution:**
- Client-side: `item.stem.variants[userSelectedLevel] || item.stem.variants[courseDefault]`
- Publish-time (optional): Generate `courses/{id}/resolved/beginner.json` for CDN caching

#### 4. Curated Tags
```sql
-- Admin-managed tag types and allowed values
tag_types (organization_id, key, label, is_enabled, display_order)
tags (organization_id, type_key, value, slug, is_active)

-- AI suggests tags; admin approves/maps before publish
course_metadata (course_id, organization_id, tag_ids UUID[])
```

**Workflow:**
1. AI generates course → suggests tags as freeform strings
2. Admin reviews → maps to curated tags OR creates new allowed value
3. Publish validates all tags exist in `tags` table

#### 5. Versioning & Rollback
```sql
course_versions (
  id UUID PRIMARY KEY,
  course_id TEXT,
  version INT,
  snapshot JSONB,  -- Full course JSON
  published_by UUID,
  published_at TIMESTAMPTZ,
  changelog TEXT
)
```

**Rollback:**
- "Restore as new version" only (never destructive)
- Restoring version 3 → creates version 7 with snapshot from version 3
- Admins-only; indefinite retention (compress old snapshots)

#### 6. Roles & Authentication
- JWT-based role resolution from `app_metadata.role` or `user_metadata.role`
- Replace email-based admin checks (`user.email.includes('admin')`)
- Per-org SSO configs stored in `organizations.settings.sso` (OIDC/SAML)

#### 7. Catalog & Search
- `CourseSelector` queries `course_metadata` with curated tag filters
- Fallback to `public/catalog.json` during migration
- Semantic search (pgvector) scoped by `organization_id`

#### 8. Performance & Caching
- CDN cache course JSON (1h TTL) and resolved snapshots (immutable)
- Purge on publish; bump integer `etag` and `contentVersion`
- Embeddings regenerated async on publish for changed text

## Consequences

### Positive
✅ **Performance preserved**: Still 1 JSON fetch/course (no N+1 queries)  
✅ **Low migration risk**: Course Editor, Play flow unchanged  
✅ **Minimal schema**: 8 new tables vs. 20+ in full relational model  
✅ **Client-side resolution**: No runtime DB overhead for variants  
✅ **Strict isolation**: RLS enforces org boundaries  
✅ **Disaster recovery**: Full JSON snapshots enable safe rollback  

### Negative
❌ **No per-field change tracking**: Only full-course snapshots (not granular JSON Patch log)  
❌ **Variants in JSON**: Harder to query "all beginner-level stems" (need embeddings or full scan)  
❌ **Tag curation friction**: AI can't auto-create tags (requires admin approval)  

### Mitigations
- **Granular logging**: Add optional `course_change_log` (JSON Patch ops) for audit trail if needed
- **Variant queries**: Pre-compute embeddings per level during publish
- **Tag UX**: One-click approve/map for AI suggestions; bulk import for initial seeding

## Alternatives Considered

### Alternative 1: Full Relational Storage
- Migrate all courses from JSON → PostgreSQL tables (`courses`, `course_items`, `content_variants`)
- **Rejected**: 80-120 hours effort, breaks existing editor/play flow, performance hit (150+ queries/game)

### Alternative 2: Runtime Variant Resolution (DB)
- Store variants in `content_variants` table, resolve via DB queries
- **Rejected**: Adds 50+ DB queries/course load; defeats JSON caching advantage

### Alternative 3: Freeform Tags (No Curation)
- Allow any tag; no admin pre-approval
- **Rejected**: User requirement for "no tag mess"; need controlled vocabulary

## Implementation Phases

1. **Phase 1**: Schema & RLS (organizations, tags, metadata, versions)
2. **Phase 2**: Backfill metadata from existing courses
3. **Phase 3**: API layer (org config, course filters, publish, restore)
4. **Phase 4**: Tag curation UI (management + approval queue)
5. **Phase 5**: Variants in JSON (editor + play flow)
6. **Phase 6**: Publish pipeline (snapshots, embeddings)
7. **Phase 7**: Catalog & selector (query metadata, curated filters)
8. **Phase 8**: Auth & roles (JWT, SSO, RLS enforcement)
9. **Phase 9**: Caching & telemetry
10. **Phase 10**: Docs & compliance
11. **Phase 11**: E2E tests
12. **Phase 12**: Rollout

## References

- [UNIFIED_COURSE_EDITOR_PLAN.md](../legacy-course-reference.md#how-to-access) *(archived)*
- [Supabase RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [pgvector for Semantic Search](https://github.com/pgvector/pgvector)

## Acceptance Criteria

- [x] Minimal Hybrid approach approved
- [x] Variant model (4 levels, JSON-embedded, client resolution) approved
- [x] Curated tags (admin-managed, AI suggests) approved
- [x] Rollback policy (restore-as-new-version, full snapshots) approved
- [x] Roles/SSO (JWT, per-org, superadmin) approved
- [x] Catalog sourcing (metadata, fallback catalog.json) approved
- [x] Performance/caching (CDN, 1h TTL, etag) approved
- [x] Naming conventions (kebab-case IDs, snake_case keys) approved

