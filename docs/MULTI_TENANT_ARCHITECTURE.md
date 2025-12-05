# Multi-Tenant Architecture - Minimal Hybrid Model

**Version:** 1.0  
**Status:** Active  
**Date:** 2025-10-25

---

## Overview

The LearnPlay Platform uses a **Minimal Hybrid** multi-tenancy model:
- **JSON-first**: Courses stored as files in Supabase Storage for performance
- **Metadata layer**: PostgreSQL tables for organization scoping, curated tags, versions
- **Strict isolation**: Row Level Security (RLS) enforces `organization_id` boundaries
- **White-label ready**: Per-org branding, domains, SSO, catalog customization

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Organizations                         │
│  (id, name, slug, branding, settings)                       │
└──────────────────┬──────────────────────────────────────────┘
                   │
      ┌────────────┼────────────┬──────────────┐
      │            │            │              │
┌─────▼─────┐ ┌───▼────┐ ┌─────▼──────┐ ┌────▼──────┐
│  Domains  │ │  Roles │ │  Tag Types │ │  Courses  │
│  (custom) │ │ (RBAC) │ │  (curated) │ │ (metadata)│
└───────────┘ └────────┘ └──────┬─────┘ └─────┬─────┘
                                 │             │
                           ┌─────▼─────┐       │
                           │   Tags    │       │
                           │ (values)  │       │
                           └───────────┘       │
                                               │
                                    ┌──────────▼──────────┐
                                    │  Supabase Storage   │
                                    │  courses/{id}.json  │
                                    │  (with variants)    │
                                    └─────────────────────┘
```

---

## Database Schema

### Core Multi-Tenancy Tables

#### organizations
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,              -- subdomain or path slug
  branding JSONB DEFAULT '{}'::jsonb,     -- { logoUrl, primaryColor, secondaryColor, typography }
  settings JSONB DEFAULT '{}'::jsonb,     -- see Org Settings Schema below
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
```

**Org Settings Schema:**
```json
{
  "tagTypes": {
    "enabled": ["domain", "level", "theme", "subject", "class"],
    "order": ["domain", "level", "subject", "theme", "class"],
    "labels": {
      "domain": "Domain",
      "level": "Grade Level",
      "subject": "Subject",
      "theme": "Theme",
      "class": "Class"
    }
  },
  "catalog": {
    "defaultViewId": null,
    "cards": { "showBadges": true, "showOwner": false }
  },
  "variants": {
    "difficulty": {
      "exposeToUsers": true,
      "defaultLevelId": "intermediate",
      "labels": {
        "beginner": "Beginner",
        "intermediate": "Intermediate",
        "advanced": "Advanced",
        "expert": "Expert"
      }
    }
  },
  "sso": {
    "providers": []  // Per-org OIDC/SAML configs (managed via secure admin UI)
  }
}
```

#### organization_domains
```sql
CREATE TABLE organization_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT UNIQUE NOT NULL,            -- e.g., 'school-a.learnplay.com' or 'learn.schoola.edu'
  is_primary BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_organization_domains_org ON organization_domains(organization_id);
CREATE UNIQUE INDEX idx_organization_domains_primary ON organization_domains(organization_id) 
  WHERE is_primary = true;
```

#### user_roles
```sql
CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = superadmin
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'org_admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_org ON user_roles(organization_id) WHERE organization_id IS NOT NULL;
```

**Role Hierarchy:**
- `superadmin`: Global access to all orgs (NULL `organization_id`)
- `org_admin`: Full admin within one org
- `editor`: Can create/edit courses within org
- `viewer`: Read-only access within org

### Curated Tag System

#### tag_types
```sql
CREATE TABLE tag_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = global default
  key TEXT NOT NULL,                      -- e.g., 'domain', 'level', 'theme', 'subject', 'class'
  label TEXT NOT NULL,                    -- per-org display name (rename supported)
  is_enabled BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
);

CREATE INDEX idx_tag_types_org ON tag_types(organization_id);
CREATE INDEX idx_tag_types_enabled ON tag_types(organization_id, is_enabled) WHERE is_enabled = true;
```

#### tags
```sql
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = global value
  type_key TEXT NOT NULL,                 -- FK-like to tag_types.key
  value TEXT NOT NULL,                    -- display text
  slug TEXT NOT NULL,                     -- kebab-case identifier
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), type_key, slug)
);

CREATE INDEX idx_tags_org_type ON tags(organization_id, type_key);
CREATE INDEX idx_tags_active ON tags(organization_id, type_key, is_active) WHERE is_active = true;
```

**Tag Curation Workflow:**
1. Admin creates `tag_types` (e.g., "Domain", "Level")
2. Admin creates allowed `tags` (e.g., domain: "Medicine", level: "University")
3. AI generates course → suggests freeform tags
4. Admin reviews → maps to existing tags OR creates new allowed value
5. Publish validates all tags exist

### Course Metadata & Versions

#### course_metadata
```sql
CREATE TABLE course_metadata (
  id TEXT PRIMARY KEY,                    -- matches course file id (e.g., 'heart-anatomy')
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('org', 'global')),
  tag_ids UUID[] DEFAULT '{}',            -- References tags.id (denormalized for perf)
  content_version INT DEFAULT 1,
  etag INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_course_metadata_org ON course_metadata(organization_id);
CREATE INDEX idx_course_metadata_visibility ON course_metadata(visibility);
CREATE INDEX idx_course_metadata_tags ON course_metadata USING GIN(tag_ids);
```

#### course_versions
```sql
CREATE TABLE course_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id TEXT NOT NULL,                -- FK to course_metadata.id
  version INT NOT NULL,
  snapshot JSONB NOT NULL,                -- Full course JSON at publish
  published_by UUID NOT NULL REFERENCES auth.users(id),
  published_at TIMESTAMPTZ DEFAULT now(),
  changelog TEXT,
  etag INT NOT NULL,
  UNIQUE (course_id, version)
);

CREATE INDEX idx_course_versions_course ON course_versions(course_id, version DESC);
CREATE INDEX idx_course_versions_published ON course_versions(published_at DESC);
```

**Versioning:**
- Every publish creates a new `course_versions` row
- Rollback = "restore as new version" (creates new version N+1 from snapshot of version M)
- Indefinite retention (compress old snapshots with pg_jsonb_compress or external archival)

### Media & Embeddings (Updated for Multi-Tenancy)

#### media_assets (add organization_id)
```sql
ALTER TABLE media_assets ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_media_assets_org ON media_assets(organization_id);
```

#### content_embeddings (add organization_id)
```sql
ALTER TABLE content_embeddings ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_content_embeddings_org ON content_embeddings(organization_id);
```

---

## Row Level Security (RLS) Policies

### Superadmin Bypass
```sql
-- Helper function to check if user is superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND organization_id IS NULL
      AND role = 'superadmin'
  );
$$ LANGUAGE SQL SECURITY DEFINER;
```

### organizations
```sql
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Superadmin: full access
CREATE POLICY "Superadmins can manage all organizations"
  ON organizations FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Org users: read own org
CREATE POLICY "Users can read their organization"
  ON organizations FOR SELECT
  USING (
    id IN (SELECT organization_id FROM user_roles WHERE user_id = auth.uid())
  );

-- Org admins: update own org
CREATE POLICY "Org admins can update their organization"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role = 'org_admin'
    )
  );
```

### course_metadata
```sql
ALTER TABLE course_metadata ENABLE ROW LEVEL SECURITY;

-- Superadmin: full access
CREATE POLICY "Superadmins can manage all course metadata"
  ON course_metadata FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Org users: read own org's courses + global courses
CREATE POLICY "Users can read org and global courses"
  ON course_metadata FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM user_roles WHERE user_id = auth.uid())
    OR visibility = 'global'
  );

-- Editors: insert/update/delete own org's courses
CREATE POLICY "Editors can manage org courses"
  ON course_metadata FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('org_admin', 'editor')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('org_admin', 'editor')
    )
  );
```

### tags, tag_types (similar scoping)
```sql
-- Allow org admins to manage their org's tags
-- Allow all org users to read their org's tags + global tags
-- Superadmin bypass for all
```

### course_versions
```sql
-- Admins only: read own org's versions
-- Superadmin: all versions
```

---

## Course JSON Schema (vNext with Variants)

```typescript
interface CourseVNext {
  id: string;                             // kebab-case, e.g., 'heart-anatomy'
  organizationId: string;                 // UUID
  title: string;
  locale?: string;
  contentVersion: number;                 // Bumped on every publish
  etag: number;                           // Bumped on every save
  description?: string;
  
  // Curated tags (IDs reference tags table)
  tags?: {
    domain?: string[];                    // tag slugs
    level?: string[];
    theme?: string[];
    subject?: string[];
    class?: string[];
  };
  
  // Variants configuration
  variants: {
    difficulty: {
      levels: Array<{
        id: 'beginner' | 'intermediate' | 'advanced' | 'expert';
        label: string;                    // Per-org customizable
        order: number;
      }>;
      default: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    };
  };
  
  // Study texts (course-level HTML)
  studyTexts?: Array<{
    id: string;
    title: string;
    content: string;                      // Full HTML with inline media
    order: number;
    variants?: {
      beginner?: string;                  // Optional per-level HTML
      intermediate?: string;
      advanced?: string;
      expert?: string;
    };
  }>;
  
  // Course structure (unchanged)
  levels: CourseLevel[];
  groups: CourseGroup[];
  
  // Items with variant support
  items: Array<{
    id: number;
    groupId: number;
    mode?: 'options' | 'numeric';
    
    // Stem with variants
    stem: {
      variants: {
        beginner?: string;
        intermediate?: string;
        advanced?: string;
        expert?: string;
      };
      media?: {
        variants?: {
          beginner?: MediaAsset[];
          intermediate?: MediaAsset[];
          advanced?: MediaAsset[];
          expert?: MediaAsset[];
        };
      };
    };
    
    // Options (for mode: 'options')
    options?: Array<{
      id: string;
      variants: {
        beginner?: string;
        intermediate?: string;
        advanced?: string;
        expert?: string;
      };
      media?: {
        variants?: {
          beginner?: MediaAsset[];
          intermediate?: MediaAsset[];
          advanced?: MediaAsset[];
          expert?: MediaAsset[];
        };
      };
    }>;
    
    // Numeric answer (for mode: 'numeric')
    answer?: number;
    correctIndex?: number;                // For mode: 'options'
    
    // Explanation with variants
    explanation?: {
      variants: {
        beginner?: string;                // Full HTML
        intermediate?: string;
        advanced?: string;
        expert?: string;
      };
      media?: {
        variants?: {
          beginner?: MediaAsset[];
          intermediate?: MediaAsset[];
          advanced?: MediaAsset[];
          expert?: MediaAsset[];
        };
      };
    };
    
    // Legacy fields (fallback for backward compatibility)
    text?: string;                        // Old stem.text
    explain?: string;                     // Old explanation
    stimulus?: MediaAsset;                // Old stem.media[0]
    optionMedia?: (MediaAsset | null)[];  // Old options[i].media[0]
  }>;
}

interface MediaAsset {
  type: 'image' | 'audio' | 'video';
  url: string;
  alt?: string;
  transcriptUrl?: string;
  captionsUrl?: string;
  placement?: 'block' | 'inline';
}
```

**Variant Resolution Logic (Client-Side):**
```typescript
function resolveVariant<T>(
  variants: Record<string, T>,
  userLevel: string,
  courseDefault: string
): T {
  return variants[userLevel] || variants[courseDefault] || Object.values(variants)[0];
}

// Example usage in Play flow
const stemText = resolveVariant(
  item.stem.variants,
  userSelectedLevel,
  course.variants.difficulty.default
);
```

---

## API Endpoints

### GET /org/config
**Returns:** Organization branding, settings, curated tag types/values

**Response:**
```json
{
  "organization": {
    "id": "uuid",
    "name": "School A",
    "slug": "school-a",
    "branding": {
      "logoUrl": "https://...",
      "primaryColor": "#1E40AF",
      "secondaryColor": "#F59E0B"
    }
  },
  "tagTypes": [
    {
      "key": "domain",
      "label": "Domain",
      "isEnabled": true,
      "displayOrder": 0,
      "tags": [
        {"id": "uuid", "value": "Medicine", "slug": "medicine"},
        {"id": "uuid", "value": "Computer Science", "slug": "computer-science"}
      ]
    }
  ],
  "variantConfig": {
    "difficulty": {
      "levels": [
        {"id": "beginner", "label": "Beginner", "order": 0},
        {"id": "intermediate", "label": "Intermediate", "order": 1}
      ],
      "default": "intermediate",
      "exposeToUsers": true
    }
  }
}
```

### GET /courses
**Query Params:**
- `organizationId` (optional, for superadmin)
- `visibility` (optional: `org`, `global`)
- `tags` (optional: comma-separated tag IDs)
- `search` (optional: semantic search query)
- `limit`, `offset`

**Response:**
```json
{
  "courses": [
    {
      "id": "heart-anatomy",
      "title": "Heart Anatomy Basics",
      "organizationId": "uuid",
      "visibility": "org",
      "tags": {"domain": ["medicine"], "level": ["university"]},
      "contentVersion": 5,
      "etag": 42,
      "updatedAt": "2025-10-25T12:00:00Z"
    }
  ],
  "total": 150,
  "limit": 20,
  "offset": 0
}
```

### POST /courses/:id/publish
**Request:**
```json
{
  "changelog": "Added beginner-level variants for all items"
}
```

**Response:**
```json
{
  "version": 6,
  "snapshotId": "uuid",
  "contentVersion": 6,
  "etag": 43,
  "publishedAt": "2025-10-25T12:05:00Z"
}
```

**Side Effects:**
- Creates `course_versions` row with full JSON snapshot
- Bumps `course_metadata.content_version` and `etag`
- Triggers async job to regenerate embeddings for changed text
- Invalidates CDN cache for `courses/{id}.json`

### POST /courses/:id/restore/:version
**Request:**
```json
{
  "changelog": "Restored from version 3 due to content error"
}
```

**Response:**
```json
{
  "newVersion": 7,
  "restoredFromVersion": 3,
  "snapshotId": "uuid",
  "contentVersion": 7,
  "etag": 44
}
```

**Logic:**
- Loads snapshot from `course_versions` WHERE `course_id = :id AND version = :version`
- Creates **new version** (version 7) with that snapshot
- Never deletes or modifies old versions (non-destructive)

### PATCH /courses/:id/metadata
**Request:**
```json
{
  "tagIds": ["uuid1", "uuid2"],
  "visibility": "global"
}
```

**Response:**
```json
{
  "id": "heart-anatomy",
  "organizationId": "uuid",
  "visibility": "global",
  "tagIds": ["uuid1", "uuid2"],
  "etag": 45
}
```

### Admin Tag Management
- `GET /admin/tag-types` (list types for org)
- `POST /admin/tag-types` (create type)
- `PATCH /admin/tag-types/:id` (update label, order, enable/disable)
- `DELETE /admin/tag-types/:id` (soft delete if no courses use it)
- `GET /admin/tags?typeKey=domain` (list values)
- `POST /admin/tags` (create allowed value)
- `PATCH /admin/tags/:id` (update value, slug, activate/deactivate)

---

## Tag Approval Workflow

### AI Suggests Tags → Admin Approves/Maps

**Step 1: AI Course Generation**
```json
// AI returns freeform tags
{
  "suggestedTags": {
    "domain": ["Cardiology"],
    "level": ["Medical School"],
    "theme": ["Anatomy"]
  }
}
```

**Step 2: Tag Mapping UI**
```
┌─────────────────────────────────────────────┐
│ Tag Approval Queue                          │
├─────────────────────────────────────────────┤
│ AI Suggested: "Cardiology" (domain)         │
│ ○ Map to existing: [Medicine ▼]            │
│ ○ Create new tag: [Cardiology] [Create]    │
│                                             │
│ AI Suggested: "Medical School" (level)      │
│ ○ Map to existing: [University ▼]          │
│ ○ Create new tag: [Medical School] [Create]│
│                                             │
│ [Approve All] [Reject]                      │
└─────────────────────────────────────────────┘
```

**Step 3: Publish Validation**
- Validates all `course.tags` exist in `tags` table
- Rejects publish if unmapped tags remain

---

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Course IDs | kebab-case | `heart-anatomy-basics` |
| Tag type keys | snake_case | `domain`, `grade_level` |
| Tag slugs | kebab-case | `medicine`, `computer-science` |
| Variant IDs | lowercase | `beginner`, `intermediate` |
| Org slugs | kebab-case | `school-a`, `district-123` |

---

## Performance & Caching

### CDN Strategy
```
Course JSON:
  Path: /storage/v1/object/public/courses/{id}.json
  Cache-Control: max-age=3600, must-revalidate
  ETag: {etag}
  Purge on: Publish (POST /courses/:id/publish)

Resolved Snapshots (optional):
  Path: /storage/v1/object/public/courses/{id}/resolved/{level}.json
  Cache-Control: max-age=604800, immutable
  ETag: {etag}-{level}
  Purge on: Publish
```

### Embedding Regeneration
```typescript
// On publish, async job regenerates embeddings for changed fields
async function onPublish(courseId: string, oldSnapshot: Course, newSnapshot: Course) {
  const changedItems = diffItems(oldSnapshot.items, newSnapshot.items);
  
  for (const item of changedItems) {
    for (const level of ['beginner', 'intermediate', 'advanced', 'expert']) {
      const stemText = item.stem.variants[level];
      if (stemText) {
        await upsertEmbedding({
          courseId,
          itemId: item.id,
          contentType: 'stem',
          levelId: level,
          textContent: stemText,
          embedding: await generateEmbedding(stemText)
        });
      }
    }
  }
}
```

---

## Migration & Rollout

### Phase 1: Schema Setup
1. Apply migrations for `organizations`, `tag_types`, `tags`, `course_metadata`, `course_versions`
2. Enable RLS policies
3. Create default organization ("LearnPlay") for existing courses

### Phase 2: Backfill
```typescript
// Script: scripts/backfill-course-metadata.ts
async function backfillCourseMetadata() {
  const defaultOrgId = await getOrCreateDefaultOrg();
  const courses = await listAllCoursesFromStorage();
  
  for (const courseFile of courses) {
    const course = await loadCourseJSON(courseFile.path);
    
    // Extract tags heuristically (pending approval)
    const suggestedTags = extractTagsFromCourse(course);
    
    await supabase.from('course_metadata').insert({
      id: course.id,
      organization_id: defaultOrgId,
      visibility: 'global',
      tag_ids: [],  // Empty until admin approves
      content_version: course.contentVersion || 1,
      etag: course.etag || 1
    });
    
    // Log suggested tags to approval queue
    await logPendingTags(course.id, suggestedTags);
  }
  
  console.log(`Backfilled ${courses.length} courses`);
}
```

### Phase 3: Validation
- Verify all courses in storage have `course_metadata` row
- Generate report: `reports/backfill-validation-{timestamp}.md`
- Check RLS: ensure org users can only see their courses

### Phase 4: Catalog Switch
- Update `CourseSelector` to query `course_metadata` (with fallback to `public/catalog.json`)
- Monitor for 1 week
- Deprecate `catalog.json` once stable

---

## Security Checklist

- [x] RLS enabled on all multi-tenant tables
- [x] Superadmin role isolated (NULL `organization_id`)
- [x] JWT-based role resolution (no email-based checks)
- [x] Course visibility enforced (org vs global)
- [x] Tag curation prevents uncontrolled vocab
- [x] Version snapshots audit trail (admins-only)
- [x] SSO per-org (OIDC/SAML)
- [x] Media/embeddings scoped by `organization_id`

---

## Testing Strategy

### RLS Tests (Integration)
```typescript
// tests/integration/rls/course-metadata.test.ts
test('Org user cannot read other org courses', async () => {
  const orgA = await createOrg('Org A');
  const orgB = await createOrg('Org B');
  const userA = await createUser({ orgId: orgA.id, role: 'editor' });
  const courseB = await createCourse({ orgId: orgB.id, id: 'course-b' });
  
  const { data, error } = await supabase
    .from('course_metadata')
    .select('*')
    .eq('id', courseB.id)
    .as(userA);  // Impersonate userA
  
  expect(data).toEqual([]);  // RLS blocks
});

test('Superadmin can read all org courses', async () => {
  const superadmin = await createUser({ role: 'superadmin' });
  const courseB = await createCourse({ orgId: orgB.id, id: 'course-b' });
  
  const { data } = await supabase
    .from('course_metadata')
    .select('*')
    .eq('id', courseB.id)
    .as(superadmin);
  
  expect(data).toHaveLength(1);
});
```

### Variant Resolution Tests (Unit)
```typescript
// tests/unit/variant-resolution.test.ts
test('Resolves to user-selected level if available', () => {
  const variants = {
    beginner: 'What pumps blood?',
    advanced: 'Describe the cardiac cycle.'
  };
  
  const result = resolveVariant(variants, 'advanced', 'beginner');
  expect(result).toBe('Describe the cardiac cycle.');
});

test('Falls back to default if user level missing', () => {
  const variants = {
    beginner: 'What pumps blood?',
    intermediate: 'What is the heart?'
  };
  
  const result = resolveVariant(variants, 'advanced', 'intermediate');
  expect(result).toBe('What is the heart?');
});
```

### E2E Tests (Playwright)
```typescript
// tests/e2e/multi-tenant.spec.ts
test('Org admin can publish course and create version snapshot', async ({ page }) => {
  await loginAsOrgAdmin(page, 'org-a');
  await page.goto('/admin/editor/heart-anatomy');
  
  await page.fill('[data-testid="stem-editor"]', 'New stem text');
  await page.click('[data-testid="publish-button"]');
  
  await page.waitForSelector('text=Version 2 published');
  
  // Verify snapshot in DB
  const { data } = await supabase
    .from('course_versions')
    .select('*')
    .eq('course_id', 'heart-anatomy')
    .order('version', { ascending: false })
    .limit(1);
  
  expect(data[0].version).toBe(2);
  expect(data[0].snapshot.items[0].stem.variants.intermediate).toContain('New stem text');
});
```

---

## Disaster Recovery

### Rollback Procedure
1. **Identify target version:**
   ```sql
   SELECT version, published_at, changelog
   FROM course_versions
   WHERE course_id = 'heart-anatomy'
   ORDER BY version DESC;
   ```

2. **Restore via API:**
   ```bash
   curl -X POST https://api.learnplay.com/courses/heart-anatomy/restore/3 \
     -H "Authorization: Bearer {token}" \
     -d '{"changelog": "Restored due to content error in v4-v6"}'
   ```

3. **Verify:**
   - Check new version created (v7 with snapshot from v3)
   - CDN cache purged
   - Users see restored content

### Backup Strategy
- **Database**: Supabase automated daily backups (7-day retention)
- **Storage**: Supabase storage replication across AZs
- **Versions**: Indefinite retention in `course_versions` (compress old snapshots monthly)

---

## Future Enhancements

- **Real-time collaboration**: WebSocket sync for multi-admin editing (OT/CRDT)
- **Advanced search**: Combine semantic + metadata filters (faceted search)
- **Batch operations**: "Apply AI rewrite to all items in group" with bulk preview
- **Custom AI models**: Fine-tune smaller embedding model on course-specific corpus
- **SAML SSO**: Add full SAML 2.0 support (currently OIDC only)
- **Org forking**: Allow cross-org course forking with attribution (currently disabled)

---

## References

- [ADR 004: Minimal Hybrid Multi-Tenancy](./adr/004-minimal-hybrid-multi-tenancy.md)
- [Unified Course Editor Plan](./legacy-course-reference.md#how-to-access) *(archived)*
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [pgvector Documentation](https://github.com/pgvector/pgvector)

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-25  
**Owner:** Engineering Team

