# API Versioning Strategy

## Current State

Edge functions are currently accessed at `/functions/v1/<function-name>`; clients currently hardcode v1 and version negotiation is not implemented yet.

The `v1` prefix is already in place via Supabase's default routing. This document outlines our versioning strategy for future breaking changes.

## Versioning Principles

1. **Backwards Compatibility:** Maintain existing endpoints for at least 6 months after new version release
2. **Semantic Versioning:** Follow semver for breaking changes
3. **Deprecation Warnings:** Return `X-API-Deprecated` header for old versions
4. **Clear Documentation:** Document all breaking changes in CHANGELOG.md

## Version Lifecycle

### v1 (Current)

**Status:** Active  
**Introduced:** 2025-10-01  
**Deprecation:** TBD  
**Sunset:** TBD

**Endpoints:**
- `/functions/v1/list-courses`
- `/functions/v1/get-course`
- `/functions/v1/generate-course`
- `/functions/v1/ai-job-runner`
- (+ 30 more, see [API_REFERENCE.md](./API_REFERENCE.md))

### v2 (Planned)

**Status:** Not started  
**Target:** 2025-Q2  
**Breaking Changes:**
- Course schema v2 with `schemaVersion` field
- Unified job queue API (`/v2/jobs` instead of separate course/media endpoints)
- Standardized error response format

## Implementing Breaking Changes

### Step 1: Create v2 Endpoint

```typescript
// supabase/functions/list-courses-v2/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withCors } from "../_shared/cors.ts";

serve(withCors(async (req) => {
  // v2 implementation with breaking changes
  return new Response(JSON.stringify({
    version: 2,
    courses: [], // New response format
  }));
}));
```

### Step 2: Update Client to Use v2 (Planned)

```typescript
// src/lib/api/catalog.ts
const API_VERSION = import.meta.env.VITE_API_VERSION || 'v1';

export async function getCourseCatalog(): Promise<CourseCatalogEntry[]> {
  const url = `${supabaseUrl}/functions/${API_VERSION}/list-courses`;
  // ...
}
```

### Step 3: Add Deprecation Header to v1

```typescript
// supabase/functions/list-courses/index.ts
import { stdHeaders } from "../_shared/cors.ts";

return new Response(JSON.stringify(data), {
  headers: stdHeaders(req, {
    'Content-Type': 'application/json',
    'X-API-Deprecated': 'true',
    'X-API-Sunset': '2025-12-31',
    'Link': '</functions/v2/list-courses>; rel="successor-version"',
  }),
});
```

### Step 4: Sunset v1

After 6 months:
1. Log deprecation warnings for 30 days
2. Return 410 Gone with migration guide
3. Remove v1 endpoints

## Breaking Change Criteria

A change is "breaking" if it:
- Changes request/response schema in non-additive way
- Removes or renames fields
- Changes field types
- Changes authentication requirements
- Changes error codes or formats

## Non-Breaking Changes

These can be added to existing versions:
- New optional fields in request
- New fields in response (additive)
- New endpoints
- Performance improvements
- Bug fixes

## Version Negotiation

### Client Request Header (Future)

```http
GET /functions/v1/list-courses
Accept-Version: v2
```

### Server Response Header

```http
HTTP/1.1 200 OK
API-Version: v1
X-API-Latest-Version: v2
X-API-Deprecated: true
```

## Migration Guide Template

When releasing v2, provide a migration guide:

```markdown
# Migrating from v1 to v2

## Breaking Changes

1. **Course Response Format**
   - Old: `{ courses: [...] }`
   - New: `{ version: 2, data: { courses: [...] }, meta: { ... } }`

2. **Error Format**
   - Old: `{ error: "message" }`
   - New: `{ error: { code: "ERROR_CODE", message: "...", details: {...} } }`

## Code Changes

**Before (v1):**
```typescript
const response = await fetch('/functions/v1/list-courses');
const { courses } = await response.json();
```

**After (v2):**
```typescript
const response = await fetch('/functions/v2/list-courses');
const { data: { courses } } = await response.json();
```

## Timeline

- **2025-06-01:** v2 available (v1 still works)
- **2025-09-01:** v1 deprecated warnings added
- **2025-12-01:** v1 returns 410 Gone
```

## References

- [API Reference](./API_REFERENCE.md) - Current v1 endpoints
- [CHANGELOG.md](../CHANGELOG.md) - Version history

