# CDN Caching Strategy

**Version:** 1.0  
**Last Updated:** 2025-10-25

---

## Overview

The LearnPlay Platform uses CDN caching to optimize course delivery and reduce database/storage load. This document outlines caching policies and invalidation strategies.

---

## Cache Policies

### Course JSON Files

**Path:** `/storage/v1/object/public/courses/{courseId}.json`

**Headers:**
```
Cache-Control: public, max-age=3600, must-revalidate
ETag: "{etag}"
Vary: Accept-Encoding
```

**Strategy:**
- 1-hour cache (3600 seconds)
- Browser must revalidate with server (304 Not Modified if unchanged)
- ETag bumped on every save/publish
- Purge on publish

### Resolved Variant Snapshots (Optional)

**Path:** `/storage/v1/object/public/courses/{courseId}/resolved/{level}.json`

**Headers:**
```
Cache-Control: public, max-age=604800, immutable
ETag: "{etag}-{level}"
```

**Strategy:**
- 1-week cache (604800 seconds)
- Immutable (never changes once published)
- Purge on publish (new version created)

### Media Assets

**Path:** `/storage/v1/object/public/media/{path}`

**Headers:**
```
Cache-Control: public, max-age=31536000, immutable
```

**Strategy:**
- 1-year cache
- Immutable (use content-hash in filename for versioning)
- Never purge (new files get new URLs)

---

## Cache Invalidation

### On Publish

**Trigger:** `POST /publish-course`

**Invalidate:**
1. `/courses/{courseId}.json`
2. `/courses/{courseId}/resolved/*.json` (if pre-resolved snapshots enabled)

### On Restore

**Trigger:** `POST /restore-course-version`

**Invalidate:**
1. `/courses/{courseId}.json`
2. `/courses/{courseId}/resolved/*.json`

---

## Implementation

### Supabase Storage Configuration

Supabase Storage supports cache headers via Storage policies:

```sql
-- Set cache headers on courses bucket
CREATE POLICY "Set cache headers for courses"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'courses')
WITH (
  cache_control = 'public, max-age=3600, must-revalidate'
);
```

### CDN Provider Integration

#### Option 1: Cloudflare

**Configuration:**
```javascript
// cloudflare.config.js
export default {
  cache: {
    '/storage/v1/object/public/courses/*.json': {
      edge_cache_ttl: 3600,
      browser_cache_ttl: 3600,
      cache_everything: true
    }
  }
}
```

**Purge API:**
```typescript
async function purgeCloudflare(paths: string[]) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: paths }),
    }
  );
  
  return response.json();
}
```

#### Option 2: Fastly

**Purge API:**
```typescript
async function purgeFastly(key: string) {
  const response = await fetch(
    `https://api.fastly.com/service/{SERVICE_ID}/purge/${key}`,
    {
      method: 'POST',
      headers: {
        'Fastly-Key': FASTLY_API_KEY,
      },
    }
  );
  
  return response.json();
}
```

#### Option 3: Supabase Edge Network (Built-in)

Supabase automatically caches responses at the edge. No additional CDN configuration needed for basic caching.

---

## Cache Invalidation Utility

**Location:** `src/lib/utils/cacheInvalidation.ts`

```typescript
export async function invalidateCourseCache(courseId: string) {
  const paths = [
    `/storage/v1/object/public/courses/${courseId}.json`,
    `/storage/v1/object/public/courses/${courseId}/resolved/beginner.json`,
    `/storage/v1/object/public/courses/${courseId}/resolved/intermediate.json`,
    `/storage/v1/object/public/courses/${courseId}/resolved/advanced.json`,
    `/storage/v1/object/public/courses/${courseId}/resolved/expert.json`,
  ];

  // TODO: Call CDN purge API
  console.log('[cacheInvalidation] Would purge paths:', paths);
  
  return { purged: paths.length };
}
```

---

## ETag Strategy

### How ETags Work

1. **On Save/Publish:**
   - Increment `course_metadata.etag`
   - Store in course JSON: `{ "etag": 42 }`
   - Set ETag header: `ETag: "42"`

2. **On Request:**
   - Client sends: `If-None-Match: "42"`
   - Server checks if ETag matches
   - If match: Return `304 Not Modified` (no body)
   - If mismatch: Return `200 OK` with new content

3. **On Invalidation:**
   - ETag increment forces cache miss
   - Browsers fetch new version automatically

---

## Monitoring

### Cache Hit Rate

**Target:** > 80% hit rate for course JSON

**Metrics to Track:**
- Cache hits vs misses
- Average response time (cached vs uncached)
- Purge frequency
- Storage bandwidth savings

### Alerts

- Cache hit rate < 70% (investigate)
- Purge failures
- ETag mismatches (data consistency issue)

---

## Best Practices

### Do's ✅
- Always bump ETag on content change
- Purge immediately after publish
- Use immutable URLs for media (content-hash in filename)
- Set appropriate TTLs (1h for courses, 1w for snapshots, 1y for media)

### Don'ts ❌
- Don't cache without ETag validation
- Don't purge more than necessary (expensive)
- Don't use short TTLs (<5min) - defeats caching purpose
- Don't forget Vary: Accept-Encoding for compressed responses

---

## Future Enhancements

- [ ] Pre-warming cache after publish (fetch all levels)
- [ ] Cache analytics dashboard
- [ ] Automatic cache optimization based on usage patterns
- [ ] Multi-CDN support (Cloudflare + Fastly)
- [ ] Regional cache configuration

---

**Document Version:** 1.0  
**Owner:** DevOps Team  
**Review:** Quarterly

