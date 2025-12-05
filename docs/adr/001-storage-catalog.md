# ADR 001: Storage-Based Course Catalog

**Status:** Accepted  
**Date:** 2025-01-20  
**Deciders:** Platform Team

## Context

The application needs a scalable way to serve course content to thousands of concurrent users while maintaining fast load times, version control, and cache efficiency.

## Decision

We use **Supabase Storage** as the authoritative source for course content, served via edge functions with aggressive HTTP caching.

### Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ GET /list-courses
       ▼
┌─────────────────┐
│  Edge Function  │──► ETag generation (SHA-1 hash)
│  list-courses   │──► Cache-Control headers
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Storage Bucket  │
│  courses/       │──► catalog.json
│                 │──► {courseId}/course.json
└─────────────────┘
```

### Key Components

1. **Storage Structure:**
   - `courses/catalog.json` - Master catalog with metadata
   - `courses/{courseId}/course.json` - Individual course data

2. **Caching Strategy:**
   - **Client-side:** `max-age=60` (1 minute browser cache)
   - **CDN:** `s-maxage=300` (5 minute edge cache)
   - **Stale-while-revalidate:** `600` (10 minute grace period)
   - **ETags:** SHA-1 hash of content for validation

3. **Version Detection:**
   - Each course has a `contentVersion` field
   - Client stores version map in localStorage
   - Background revalidation checks for version changes
   - Automatic cache bust + re-render on version mismatch

## Consequences

### Positive

✅ **Performance:** Sub-100ms response times with CDN caching  
✅ **Scalability:** Handles millions of requests without database load  
✅ **Versioning:** Clean content updates with automatic cache invalidation  
✅ **Reliability:** Stale-while-revalidate prevents cache stampedes  
✅ **Cost:** Storage + bandwidth cheaper than database queries

### Negative

❌ **Complexity:** ETag generation and cache management logic  
❌ **Eventual consistency:** 1-5 minute delay for content updates  
❌ **Storage limits:** Supabase storage has size/bandwidth quotas

## Implementation Details

### ETag Generation
```typescript
const sha1Hex = async (s: string): Promise<string> => {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
```

### Cache Headers
```typescript
"Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
"ETag": `"${etag}"`
"Age": "0" // CDN-added
```

### Version Change Flow
```
1. Backend updates course → contentVersion bumps
2. Client fetches catalog → compares versions
3. Version mismatch detected → clear localStorage
4. Dispatch 'catalog-version-changed' event
5. React Query invalidates → components re-render
```

## Alternatives Considered

### Database-First Approach
- ❌ Higher latency (query + serialization overhead)
- ❌ Database connection limits under high load
- ❌ More complex caching (Redis/Memcached required)

### Static Asset Serving
- ❌ No version control or rollback capability
- ❌ Harder to update content without full deployments
- ❌ No fine-grained access control

## Monitoring

Key metrics to track:
- ETag hit rate (should be >90%)
- 304 Not Modified response rate
- Average response time (target: <100ms)
- Cache miss rate on version changes
- Storage bandwidth usage

## References

- [HTTP Caching Documentation](../HTTP_CACHING.md)
- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [RFC 7232: HTTP Conditional Requests](https://tools.ietf.org/html/rfc7232)
